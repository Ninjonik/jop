import type { UserProfile } from '@/lib/dis/appwrite-client';
import { inferMovement, type EddMovement } from '@/lib/dis/edd';
import type { EddRecord } from '@/lib/dis/records';
import { clockSchema, stationKey, type Timetable } from '@/lib/dis/timetable';
import { trainCategorySchema } from '@/lib/dis/train-categories';
import { getStationDisplayName } from '@/lib/station/display-name';
import { isPublicStation } from '@/lib/station/visibility';
import { AppwriteException, ID, Query, type Models } from 'node-appwrite';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sessionRepository } from '../repositories/session-repository';
import { stationRepository } from '../repositories/station-repository';
import { databaseId, disDatabase, DisError, listDocuments } from './appwrite';
import { requireStationClaim } from './claims';
import { editDiary, projectDiary } from './edd-diary';
import { getDisUniverseId } from './places';
import { loadOperatingTimetables } from './session-timetables';

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
  const onward = new Map<string, { nextTransportPoint?: string; nextControlledArea?: string }>();
  const controlledAreas = await stationRepository.listBySessionId(scope.sessionId);
  const hints = new Map<string, { movement: EddMovement; timetableId: string }>();
  const session = await sessionRepository.findById(scope.sessionId);
  if (
    session?.interpreter.kind === 'roblox' &&
    session.interpreter.universeId === getDisUniverseId()
  ) {
    const timetables = await loadOperatingTimetables(scope.sessionId);
    for (const timetable of timetables) {
      imported += (await persistTimetableStops(scope, timetable, 'system:gvd', existingIds))
        .imported;
      timetable.stops.forEach((stop, index) => {
        if (stationKey(stop.station) === stationKey(scope.stationId)) {
          const following = timetable.stops.slice(index + 1);
          const area = following
            .map((point) =>
              controlledAreas.find(
                (area) =>
                  area.stationId !== scope.stationId &&
                  isPublicStation(area.stationId) &&
                  [area.stationId, getStationDisplayName(area.stationId)].some(
                    (name) => stationKey(name) === stationKey(point.station),
                  ),
              ),
            )
            .find(Boolean);
          onward.set(timetableEntryId(scope, timetable.$id, index), {
            nextTransportPoint: following[0]?.station,
            nextControlledArea: area ? getStationDisplayName(area.stationId) : undefined,
          });
          hints.set(timetableEntryId(scope, timetable.$id, index), {
            movement: inferMovement(stop, index, timetable.stops.length),
            timetableId: timetable.$id,
          });
        }
      });
    }
  }
  return (await projectDiary(imported ? await listStoredEdd(scope) : records, hints)).map(
    (record) => ({ ...record, ...onward.get(record.$id) }),
  );
}
function timetableEntryId(scope: DisScope, timetableId: string, index: number) {
  return createHash('sha256')
    .update(JSON.stringify([scope.sessionId, scope.stationId, timetableId, index]))
    .digest('hex')
    .slice(0, 36);
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
  schedArrival: z.union([clockSchema, z.literal('')]),
  schedDeparture: z.union([clockSchema, z.literal('')]),
  track: z.string().trim().max(16),
  direction: z.string().trim().max(128).default(''),
});
export async function createEdd(body: unknown, profile: UserProfile) {
  const command = createSchema.parse(body);
  await requireStationClaim(command.sessionId, command.stationId, profile);
  await requireStation(command);
  if (!command.schedArrival && !command.schedDeparture)
    throw new DisError(400, 'Zadajte aspoň jeden plánovaný čas.');
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
  await requireStationClaim(command.sessionId, command.stationId, profile);
  await requireStation(command);
  const session = await sessionRepository.findById(command.sessionId);
  if (
    !session ||
    session.interpreter.kind !== 'roblox' ||
    session.interpreter.universeId !== getDisUniverseId()
  )
    throw new DisError(400, 'Relácia nemá priradené miesto v tomto universe.');
  const timetable = (await loadOperatingTimetables(command.sessionId)).find(
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
    const id = timetableEntryId(scope, timetable.$id, index);
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
    .extend({
      id: identity,
      event: z.enum(['arrival', 'departure', 'passage']),
      time: z.string().optional(),
      date: z.string().optional(),
      expectedRevision: z.number().int().nonnegative().optional(),
    })
    .parse(body);
  await requireStationClaim(command.sessionId, command.stationId, profile);
  const record = (await listEdd(command)).find((r) => r.$id === command.id);
  if (!record) throw new DisError(404, 'Záznam nepatrí vybranej stanici.');
  return editDiary(
    { ...command, action: 'record', expectedRevision: command.expectedRevision ?? record.revision },
    profile,
  );
}
