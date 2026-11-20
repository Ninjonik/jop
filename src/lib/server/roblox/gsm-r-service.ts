import type { UserProfile } from '@/lib/dis/appwrite-client';
import type { DriverTrain } from '@/lib/dis/driver-train';
import { canAssignShiftRole } from '@/lib/dis/shift-plan';
import { gsmRCommandSchema, type GsmRBinding } from '@/lib/roblox/gsm-r';
import { MongoServerError } from 'mongodb';
import { Query, type Models } from 'node-appwrite';
import { DisError, listDocuments } from '../dis/appwrite';
import { getDisUniverseId } from '../dis/places';
import { loadTimetables } from '../dis/timetables';
import { getMongoDb } from '../mongo';
import { gsmRRepository } from '../repositories/gsm-r-repository';
import { sessionRepository } from '../repositories/session-repository';

async function radioSession(sessionId: string) {
  const session = await sessionRepository.findById(sessionId);
  if (!session || session.status !== 'active' || session.interpreter.kind !== 'roblox')
    throw new DisError(404, 'Aktívna Roblox relácia neexistuje.');
  if (session.interpreter.universeId !== getDisUniverseId())
    throw new DisError(400, 'Relácia nemá priradenú sieť GVD.');
  return session.interpreter;
}
export async function loadGsmR(sessionId: string) {
  await radioSession(sessionId);
  return { vehicles: await gsmRRepository.list(sessionId) };
}
export async function commandGsmR(sessionId: string, body: unknown) {
  const command = gsmRCommandSchema.parse(body);
  const interpreter = await radioSession(sessionId);
  if (command.type === 'initialize') {
    await gsmRRepository.initialize(sessionId, command.sensorIds);
    return { vehicles: await gsmRRepository.list(sessionId) };
  }
  const vehicle = (await gsmRRepository.list(sessionId)).find(
    (item) => item.sensorId === command.sensorId,
  );
  if (!vehicle) throw new DisError(404, 'Snímač vozidla nie je inicializovaný.');
  if (command.type === 'deregister' && !vehicle.binding) return { vehicle };
  if (vehicle.binding && vehicle.binding.driverId !== command.actorUserId)
    throw new DisError(403, 'Rádiostanicu používa iný rušňovodič.');
  let binding: GsmRBinding | null = null;
  if (command.type === 'register') {
    if (command.driverId !== command.actorUserId)
      throw new DisError(403, 'Číslo rušňovodiča musí byť vaše Roblox ID.');
    const profiles = await listDocuments<Models.Document & UserProfile>('profiles', [
      Query.equal('robloxUserId', command.actorUserId),
    ]);
    if (profiles.length !== 1 || !canAssignShiftRole(profiles[0], 'driver'))
      throw new DisError(403, 'Prihláste sa do DIS s prepojeným účtom rušňovodiča.');
    const driverTrain = await (
      await getMongoDb()
    )
      .collection<DriverTrain>('session_driver_trains')
      .findOne({ sessionId, userId: profiles[0].userId });
    const timetables = await loadTimetables(interpreter.placeId);
    const timetable = timetables.find((train) => train.$id === driverTrain?.timetableId);
    if (
      !driverTrain ||
      !timetable ||
      timetable.trainNumber !== command.trainNumber ||
      driverTrain.trainNumber !== command.trainNumber
    )
      throw new DisError(400, 'V DIS vyberte v časti Môj vlak rovnaký vlak z GVD tejto relácie.');
    binding = {
      driverId: command.driverId,
      userId: profiles[0].userId,
      timetableId: timetable.$id,
      trainNumber: timetable.trainNumber,
      trainType: driverTrain.trainType,
      functionCode: command.functionCode,
    };
    if (
      vehicle.binding &&
      Object.entries(binding).every(
        ([key, value]) => vehicle.binding?.[key as keyof GsmRBinding] === value,
      )
    )
      return { vehicle }; // Same registration retried after a lost HTTP reply.
    if (vehicle.binding)
      throw new DisError(409, 'Pred zmenou čísla alebo funkcie zrušte registráciu.');
  }
  if (vehicle.revision !== command.expectedRevision)
    throw new DisError(409, 'Stav rádia sa zmenil. Obnovte stav a zopakujte operáciu.');
  try {
    const saved = await gsmRRepository.setBinding(vehicle, binding);
    if (!saved) throw new DisError(409, 'Stav rádia sa zmenil. Zopakujte operáciu.');
    return { vehicle: saved };
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000)
      throw new DisError(409, 'Číslo vlaku s touto funkciou alebo rušňovodič je už registrovaný.');
    throw error;
  }
}
