import type { UserProfile } from '@/lib/dis/appwrite-client';
import { callsignNumber } from '@/lib/dis/callsign';
import type { DriverTrain } from '@/lib/dis/driver-train';
import type { GsmRCommunication } from '@/lib/dis/radio';
import { canAssignShiftRole } from '@/lib/dis/shift-plan';
import { gsmRCommandSchema, type GsmRBinding } from '@/lib/roblox/gsm-r';
import { physicalVehicleRadioZone } from '@/lib/station/physical-trains';
import { MongoServerError } from 'mongodb';
import type { Models } from 'node-appwrite';
import { DisError, listDocuments } from '../dis/appwrite';
import { getDisUniverseId } from '../dis/places';
import { loadOperatingTimetables } from '../dis/session-timetables';
import { getMongoDb } from '../mongo';
import { gsmRRepository } from '../repositories/gsm-r-repository';
import { radioTerminalRepository } from '../repositories/radio-terminal-repository';
import { loadRadioZones } from '../repositories/radio-zone-repository';
import { sessionRepository } from '../repositories/session-repository';
import { stationRepository } from '../repositories/station-repository';
import { serializeSessionMutation } from '../services/station-service';
import { refreshPhysicalTrainLabels } from './physical-trains';

async function radioSession(sessionId: string) {
  const session = await sessionRepository.findById(sessionId);
  if (!session || session.status !== 'active' || session.interpreter.kind !== 'roblox')
    throw new DisError(404, 'Aktívna Roblox relácia neexistuje.');
  if (session.interpreter.universeId !== getDisUniverseId())
    throw new DisError(400, 'Relácia nemá priradenú sieť GVD.');
  return session.interpreter;
}
export async function loadGsmR(sessionId: string) {
  const interpreter = await radioSession(sessionId);
  const [vehicles, session, stations] = await Promise.all([
    gsmRRepository.list(sessionId),
    sessionRepository.findById(sessionId),
    stationRepository.listBySessionId(sessionId),
  ]);
  const zones = await loadRadioZones(
    interpreter.universeId,
    interpreter.placeId,
    stations.map((station) => station.stationId),
  );
  return {
    vehicles: await Promise.all(
      vehicles.map(async (vehicle) => {
        const terminal = vehicle.binding
          ? await radioTerminalRepository.find(vehicle.binding.userId)
          : null;
        const connected =
          !!terminal?.ownerSocketId &&
          terminal.sessionId === sessionId &&
          terminal.endpoint?.kind === 'driver' &&
          (terminal.expiresAt ?? 0) > Date.now();
        const communication: GsmRCommunication = {
          zone: session ? physicalVehicleRadioZone(session, vehicle.sensorId, zones) : '--',
          browserConnected: connected,
          call: connected ? terminal!.call : null,
          outgoingEmergency: connected
            ? (terminal!.emergencies.find((call) => call.outgoing) ?? null)
            : null,
          incomingEmergencies: connected
            ? terminal!.emergencies.filter((call) => !call.outgoing).length
            : 0,
          notice: connected ? terminal!.notice : '',
        };
        return { ...vehicle, communication };
      }),
    ),
  };
}
export async function commandGsmR(sessionId: string, body: unknown) {
  return serializeSessionMutation(sessionId, () => applyGsmRCommand(sessionId, body));
}
async function applyGsmRCommand(sessionId: string, body: unknown) {
  const command = gsmRCommandSchema.parse(body);
  await radioSession(sessionId);
  if (command.type === 'initialize') {
    await gsmRRepository.initialize(sessionId, command.sensorIds);
    return { vehicles: await gsmRRepository.list(sessionId) };
  }
  const vehicle = (await gsmRRepository.list(sessionId)).find(
    (item) => item.sensorId === command.sensorId,
  );
  if (!vehicle) throw new DisError(404, 'Snímač vozidla nie je inicializovaný.');
  if (command.type === 'radio-action') {
    if (!vehicle.binding || vehicle.binding.driverId !== command.actorUserId)
      throw new DisError(403, 'Najprv zaregistrujte rádio vlastným volacím znakom.');
    const terminal = await radioTerminalRepository.find(vehicle.binding.userId);
    if (
      !terminal?.ownerSocketId ||
      terminal.sessionId !== sessionId ||
      terminal.endpoint?.kind !== 'driver' ||
      (terminal.expiresAt ?? 0) <= Date.now()
    )
      throw new DisError(409, 'V DIS aktivujte hlasový terminál rušňovodiča v tejto relácii.');
    const saved = await radioTerminalRepository.enqueue({
      _id: command.commandId,
      sessionId,
      userId: vehicle.binding.userId,
      actorUserId: command.actorUserId,
      sensorId: vehicle.sensorId,
      action: command.action,
      status: 'queued',
      createdAt: Date.now(),
      expiresAt: Date.now() + 10000,
    });
    if (
      !saved ||
      saved.sessionId !== sessionId ||
      saved.userId !== vehicle.binding.userId ||
      saved.sensorId !== vehicle.sensorId ||
      saved.action !== command.action
    )
      throw new DisError(409, 'Identifikátor požiadavky už bol použitý.');
    return { queued: true };
  }
  if (command.type === 'deregister' && !vehicle.binding) {
    await refreshPhysicalTrainLabels(sessionId);
    return { vehicle };
  }
  if (vehicle.binding && vehicle.binding.driverId !== command.actorUserId)
    throw new DisError(403, 'Rádiostanicu používa iný rušňovodič.');
  let binding: GsmRBinding | null = null;
  if (command.type === 'register') {
    const personnel = await listDocuments<Models.Document & UserProfile>('profiles');
    const profiles = personnel.filter((profile) => profile.robloxUserId === command.actorUserId);
    if (profiles.length !== 1 || !canAssignShiftRole(profiles[0], 'driver'))
      throw new DisError(403, 'Prihláste sa do DIS s prepojeným účtom rušňovodiča.');
    if (callsignNumber(profiles[0].callsign) !== command.driverId)
      throw new DisError(403, 'Zadajte tri číslice svojho volacieho znaku z Personálu DIS.');
    const sameCallsign = personnel.filter((profile) => profile.callsign === profiles[0].callsign);
    if (sameCallsign.length !== 1 || sameCallsign[0].userId !== profiles[0].userId)
      throw new DisError(
        409,
        'Volací znak nie je jedinečný. Otvorte Personál DIS a obnovte údaje.',
      );
    const driverTrain = await (
      await getMongoDb()
    )
      .collection<DriverTrain>('session_driver_trains')
      .findOne({ sessionId, userId: profiles[0].userId, expiresAt: { $gt: Date.now() } });
    const timetables = await loadOperatingTimetables(sessionId);
    const timetable = timetables.find((train) => train.trainNumber === command.trainNumber);
    if (!driverTrain || driverTrain.trainNumber !== command.trainNumber)
      throw new DisError(400, 'V DIS vyberte v časti Môj vlak rovnaké číslo vlaku tejto relácie.');
    binding = {
      driverId: command.actorUserId,
      driverCallsign: command.driverId,
      userId: profiles[0].userId,
      timetableId: timetable && driverTrain.timetableId === timetable.$id ? timetable.$id : null,
      trainNumber: command.trainNumber,
      trainType: timetable?.trainType ?? 'Pos',
      functionCode: command.functionCode,
    };
    if (
      vehicle.binding &&
      Object.entries(binding).every(
        ([key, value]) => vehicle.binding?.[key as keyof GsmRBinding] === value,
      )
    ) {
      await refreshPhysicalTrainLabels(sessionId);
      return { vehicle };
    } // Same registration retried after a lost HTTP reply.
    if (vehicle.binding)
      throw new DisError(409, 'Pred zmenou čísla alebo funkcie zrušte registráciu.');
  }
  if (vehicle.revision !== command.expectedRevision)
    throw new DisError(409, 'Stav rádia sa zmenil. Obnovte stav a zopakujte operáciu.');
  try {
    const saved = await gsmRRepository.setBinding(vehicle, binding);
    if (!saved) throw new DisError(409, 'Stav rádia sa zmenil. Zopakujte operáciu.');
    await refreshPhysicalTrainLabels(sessionId);
    return { vehicle: saved };
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000)
      throw new DisError(409, 'Číslo vlaku s touto funkciou alebo rušňovodič je už registrovaný.');
    throw error;
  }
}
