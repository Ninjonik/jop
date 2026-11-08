import type { UserProfile } from '@/lib/dis/appwrite-client';
import { currentBratislavaTime } from '@/lib/dis/clock';
import type { EddRecord } from '@/lib/dis/records';
import { clockMinutes, clockSchema, stationKey, type Timetable } from '@/lib/dis/timetable';
import { trainCategorySchema } from '@/lib/dis/train-categories';
import { AppwriteException, ID, Query, type Models } from 'node-appwrite';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sessionRepository } from '../repositories/session-repository';
import { stationRepository } from '../repositories/station-repository';
import { databaseId, disDatabase, DisError, listDocuments } from './appwrite';
import { getDisUniverseId } from './places';
import { loadTimetables } from './timetables';

const identity = z.string().trim().min(1).max(64);
export const scopeSchema = z.object({ sessionId: identity, stationId: identity });
export type DisScope = z.infer<typeof scopeSchema>;
export async function requireStation(scope: DisScope) {
  const [station, session] = await Promise.all([
    stationRepository.findBySessionAndStationId(scope.sessionId, scope.stationId),
    sessionRepository.findById(scope.sessionId),
  ]);
  if (!station || !session || session.status !== 'active')
    throw new DisError(404, 'Aktívna stanica neexistuje.');
  return station;
}
export async function listEdd(scope: DisScope) {
  await requireStation(scope);
  const records = await listStoredEdd(scope);
  const existingIds = new Set(records.map((record) => record.$id));
  let imported = 0;
  const session = await sessionRepository.findById(scope.sessionId);
  if (
    session?.interpreter.kind === 'roblox' &&
    session.interpreter.universeId === getDisUniverseId()
  ) {
    const timetables = await loadTimetables(session.interpreter.placeId);
    for (const timetable of timetables)
      imported += (await persistTimetableStops(scope, timetable, 'system:gvd', existingIds))
        .imported;
  }
  return imported ? listStoredEdd(scope) : records;
}
function listStoredEdd(scope: DisScope) {
  return listDocuments<Models.Document & EddRecord>('edd_records', [
    Query.equal('sessionId', scope.sessionId),
    Query.equal('stationId', scope.stationId),
    Query.orderAsc('schedArrival'),
  ]);
}
const createSchema = scopeSchema.extend({
  trainNumber: z.string().trim().min(1).max(32),
  trainType: trainCategorySchema,
  schedArrival: clockSchema,
  schedDeparture: clockSchema,
  track: z.string().trim().min(1).max(16),
  direction: z.string().trim().max(128).default(''),
});
export async function createEdd(body: unknown, profile: UserProfile) {
  const command = createSchema.parse(body);
  await requireStation(command);
  return {
    record: await disDatabase().createDocument(databaseId, 'edd_records', ID.unique(), {
      ...command,
      actualArrival: '',
      actualDeparture: '',
      delayMinutes: 0,
      status: 'scheduled',
      reportedBy: profile.userId,
    }),
  };
}
export async function importTimetable(body: unknown, profile: UserProfile) {
  const command = scopeSchema.extend({ timetableId: identity }).parse(body);
  await requireStation(command);
  const session = await sessionRepository.findById(command.sessionId);
  if (
    !session ||
    session.interpreter.kind !== 'roblox' ||
    session.interpreter.universeId !== getDisUniverseId()
  )
    throw new DisError(400, 'Relácia nemá priradené miesto v tomto universe.');
  const timetable = (await loadTimetables(session.interpreter.placeId)).find(
    (item) => item.$id === command.timetableId,
  );
  if (!timetable) throw new DisError(404, 'Grafikon neexistuje.');
  if (!timetable.stops.some((stop) => stationKey(stop.station) === stationKey(command.stationId)))
    throw new DisError(400, 'Grafikon nemá zastavenie s ID vybranej stanice.');
  return persistTimetableStops(command, timetable, profile.userId);
}

async function persistTimetableStops(
  scope: DisScope,
  timetable: Timetable,
  reportedBy: string,
  existingIds?: Set<string>,
) {
  const stops = timetable.stops
    .map((stop, index) => ({ stop, index }))
    .filter(({ stop }) => stationKey(stop.station) === stationKey(scope.stationId));
  let imported = 0;
  for (const { stop, index } of stops) {
    const id = createHash('sha256')
      .update(JSON.stringify([scope.sessionId, scope.stationId, timetable.$id, index]))
      .digest('hex')
      .slice(0, 36);
    if (existingIds?.has(id)) continue;
    try {
      await disDatabase().createDocument(databaseId, 'edd_records', id, {
        sessionId: scope.sessionId,
        stationId: scope.stationId,
        trainNumber: timetable.trainNumber,
        trainType: timetable.trainType,
        direction: `${timetable.stops[0].station} → ${timetable.stops.at(-1)!.station}`.slice(
          0,
          128,
        ),
        schedArrival: stop.arrival,
        schedDeparture: stop.departure,
        track: stop.track,
        actualArrival: '',
        actualDeparture: '',
        delayMinutes: 0,
        status: 'scheduled',
        reportedBy,
      });
      imported++;
    } catch (error) {
      if (!(error instanceof AppwriteException) || error.code !== 409) throw error;
    }
  }
  return { imported };
}
export async function recordEddEvent(body: unknown, profile: UserProfile) {
  const command = scopeSchema
    .extend({ id: identity, event: z.enum(['arrival', 'departure']), time: clockSchema.optional() })
    .parse(body);
  await requireStation(command);
  const db = disDatabase();
  const record = await db.getDocument<Models.Document & EddRecord>(
    databaseId,
    'edd_records',
    command.id,
  );
  if (record.sessionId !== command.sessionId || record.stationId !== command.stationId)
    throw new DisError(404, 'Záznam nepatrí vybranej stanici.');
  const arrival = command.event === 'arrival';
  if (
    arrival
      ? record.status !== 'scheduled' && record.status !== 'approaching'
      : record.status !== 'arrived'
  )
    throw new DisError(
      409,
      'Tento úkon už bol vykonaný alebo nezodpovedá stavu vlaku. Obnovte denník.',
    );
  const now = command.time ?? currentBratislavaTime();
  const planned = arrival ? record.schedArrival : record.schedDeparture;
  const difference = planned
    ? ((clockMinutes(now) - clockMinutes(planned) + 2160) % 1440) - 720
    : 0;
  const updated = await db.updateDocument(databaseId, 'edd_records', command.id, {
    [arrival ? 'actualArrival' : 'actualDeparture']: now,
    status: arrival ? 'arrived' : 'departed',
    delayMinutes: Math.max(0, difference),
    reportedBy: profile.userId,
  });
  return { record: updated };
}
