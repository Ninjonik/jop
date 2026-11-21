import type { UserProfile } from '@/lib/dis/appwrite-client';
import { CLAIM_LEASE_MS } from '@/lib/dis/claims';
import { driverTrainInputSchema, type DriverTrain } from '@/lib/dis/driver-train';
import { canAssignShiftRole } from '@/lib/dis/shift-plan';
import { getStationDisplayName } from '@/lib/station/display-name';
import { physicalVehicleStation } from '@/lib/station/physical-trains';
import { isPublicStation } from '@/lib/station/visibility';
import { MongoServerError } from 'mongodb';
import { createHash } from 'node:crypto';
import { getMongoDb } from '../mongo';
import { gsmRRepository } from '../repositories/gsm-r-repository';
import { stationRepository } from '../repositories/station-repository';
import { isRobloxSessionLive } from '../services/station-service';
import { DisError } from './appwrite';
import { requireLiveSession } from './claims';
import { getDisUniverseId } from './places';
import { loadOperatingTimetables } from './session-timetables';

async function drivingSession(sessionId: string) {
  const session = await requireLiveSession(sessionId);
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
  const result = (await getMongoDb()).collection<DriverTrain>('session_driver_trains');
  await result.createIndex(
    { claimKey: 1 },
    { unique: true, partialFilterExpression: { claimKey: { $type: 'string' } } },
  );
  await result.deleteMany({ expiresAt: { $lte: Date.now() } });
  return result;
}
const driverKey = (sessionId: string, userId: string) =>
  createHash('sha256')
    .update(JSON.stringify([sessionId, userId]))
    .digest('hex');

export async function loadDriverDashboard(sessionId: string, profile: UserProfile) {
  const session = await drivingSession(sessionId);
  if (session.interpreter.kind !== 'roblox') throw new DisError(400, 'Chýba sieť GVD.');
  const [trains, timetables, stations, radios] = await Promise.all([
    (await collection()).find({ sessionId, expiresAt: { $gt: Date.now() } }).toArray(),
    loadOperatingTimetables(sessionId),
    stationRepository.listBySessionId(sessionId),
    gsmRRepository.list(sessionId),
  ]);
  const radio = radios.find((radio) => radio.binding?.userId === profile.userId);
  const currentStationId = radio ? physicalVehicleStation(session, radio.sensorId) : null;
  const live = isRobloxSessionLive(session);
  return {
    radio: radio?.binding
      ? {
          connected: live,
          trainNumber: radio.binding.trainNumber,
          trainType: radio.binding.trainType,
          stationName:
            live && currentStationId && isPublicStation(currentStationId)
              ? getStationDisplayName(currentStationId)
              : null,
        }
      : null,
    train: trains.find((train) => train.userId === profile.userId) || null,
    timetables,
    drivers: trains,
    stations: stations
      .filter((station) => isPublicStation(station.stationId))
      .map((station) => ({
        stationId: station.stationId,
        name: getStationDisplayName(station.stationId),
      })),
  };
}

export async function saveDriverTrain(body: unknown, profile: UserProfile) {
  if (!canAssignShiftRole(profile, 'driver'))
    throw new DisError(403, 'Vlak si môže vybrať iba rušňovodič.');
  const input = driverTrainInputSchema.parse(body);
  const session = await drivingSession(input.sessionId);
  if (input.timetableId && session.interpreter.kind === 'roblox') {
    const timetable = (await loadOperatingTimetables(input.sessionId)).find(
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
    expiresAt: Date.now() + CLAIM_LEASE_MS,
    claimKey: JSON.stringify([input.sessionId, input.trainNumber.toLocaleLowerCase('sk')]),
  };
  try {
    await (await collection()).replaceOne({ _id: train._id }, train, { upsert: true });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000)
      throw new DisError(409, 'Vlak už má prideleného rušňovodiča.');
    throw error;
  }
  return { train };
}

export async function finishDriverTrain(sessionId: string, profile: UserProfile) {
  if (!canAssignShiftRole(profile, 'driver'))
    throw new DisError(403, 'Na túto operáciu nemáte oprávnenie.');
  await drivingSession(sessionId);
  await (await collection()).deleteOne({ _id: driverKey(sessionId, profile.userId) });
  return { train: null };
}
