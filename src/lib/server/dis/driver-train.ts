import type { UserProfile } from '@/lib/dis/appwrite-client';
import { driverTrainInputSchema, type DriverTrain } from '@/lib/dis/driver-train';
import { canAssignShiftRole } from '@/lib/dis/shift-plan';
import { isPublicStation } from '@/lib/station/visibility';
import { createHash } from 'node:crypto';
import { getMongoDb } from '../mongo';
import { sessionRepository } from '../repositories/session-repository';
import { stationRepository } from '../repositories/station-repository';
import { DisError } from './appwrite';
import { getDisUniverseId } from './places';
import { loadTimetables } from './timetables';

async function drivingSession(sessionId: string) {
  const session = await sessionRepository.findById(sessionId);
  if (!session || session.status !== 'active')
    throw new DisError(404, 'Aktívna relácia neexistuje.');
  if (
    session.interpreter.kind !== 'roblox' ||
    session.interpreter.universeId !== getDisUniverseId()
  )
    throw new DisError(400, 'Relácia nemá priradenú sieť GVD.');
  return session;
}
async function collection() {
  return (await getMongoDb()).collection<DriverTrain>('session_driver_trains');
}
const driverKey = (sessionId: string, userId: string) =>
  createHash('sha256')
    .update(JSON.stringify([sessionId, userId]))
    .digest('hex');

export async function loadDriverDashboard(sessionId: string, profile: UserProfile) {
  const session = await drivingSession(sessionId);
  if (session.interpreter.kind !== 'roblox') throw new DisError(400, 'Chýba sieť GVD.');
  const [trains, timetables, stations] = await Promise.all([
    (await collection()).find({ sessionId }).toArray(),
    loadTimetables(session.interpreter.placeId),
    stationRepository.listBySessionId(sessionId),
  ]);
  return {
    train: trains.find((train) => train.userId === profile.userId) || null,
    timetables,
    drivers: trains,
    stations: stations
      .filter((station) => isPublicStation(station.stationId))
      .map((station) => ({ stationId: station.stationId, name: station.stationId })),
  };
}

export async function saveDriverTrain(body: unknown, profile: UserProfile) {
  if (!canAssignShiftRole(profile, 'driver'))
    throw new DisError(403, 'Vlak si môže vybrať iba rušňovodič.');
  const input = driverTrainInputSchema.parse(body);
  const session = await drivingSession(input.sessionId);
  if (input.timetableId && session.interpreter.kind === 'roblox') {
    const timetable = (await loadTimetables(session.interpreter.placeId)).find(
      (train) => train.$id === input.timetableId,
    );
    if (!timetable || timetable.trainNumber !== input.trainNumber)
      throw new DisError(
        400,
        'Vyberte platný vlak z GVD alebo zadajte vlastné číslo bez grafikonu.',
      );
  }
  if (input.endStation && !isPublicStation(input.endStation))
    throw new DisError(400, 'Interná stanica nemôže byť cieľom vlaku.');
  const train: DriverTrain = {
    ...input,
    _id: driverKey(input.sessionId, profile.userId),
    userId: profile.userId,
    userName: profile.name,
    updatedAt: new Date().toISOString(),
  };
  await (await collection()).replaceOne({ _id: train._id }, train, { upsert: true });
  return { train };
}

export async function finishDriverTrain(sessionId: string, profile: UserProfile) {
  if (!canAssignShiftRole(profile, 'driver'))
    throw new DisError(403, 'Na túto operáciu nemáte oprávnenie.');
  await drivingSession(sessionId);
  await (await collection()).deleteOne({ _id: driverKey(sessionId, profile.userId) });
  return { train: null };
}
