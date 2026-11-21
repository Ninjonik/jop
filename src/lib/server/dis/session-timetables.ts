import type { Timetable } from '@/lib/dis/timetable';
import { checkTimetableConflicts, normalizeTimetable } from '@/lib/dis/timetable';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getMongoDb } from '../mongo';
import { DisError } from './appwrite';
import { requireLiveSession } from './claims';
import { loadTimetables, validateTimetablePlace } from './timetables';

type SessionTimetable = Timetable & { _id: string; sessionId: string };
async function collection() {
  return (await getMongoDb()).collection<SessionTimetable>('session_timetables');
}
export async function loadOperatingTimetables(sessionId: string) {
  const session = await requireLiveSession(sessionId);
  if (session.interpreter.kind !== 'roblox') return [];
  const [daily, additional] = await Promise.all([
    loadTimetables(session.interpreter.placeId),
    (await collection()).find({ sessionId }).toArray(),
  ]);
  return [...daily, ...additional];
}
export async function saveSessionTimetable(body: unknown) {
  const input = z
    .object({
      sessionId: z.string().min(1).max(64),
      timetable: z.unknown(),
      preview: z.boolean().default(false),
    })
    .parse(body);
  const session = await requireLiveSession(input.sessionId);
  if (session.interpreter.kind !== 'roblox') throw new DisError(400, 'Relácia nemá sieť GVD.');
  let timetable;
  try {
    timetable = normalizeTimetable(input.timetable);
  } catch (error) {
    throw new DisError(400, error instanceof Error ? error.message : 'Neplatný grafikon.');
  }
  await validateTimetablePlace(
    session.interpreter.placeId,
    timetable.stops.map((s) => s.station),
  );
  const current = await loadOperatingTimetables(input.sessionId);
  if (
    current.some(
      (t) =>
        t.trainNumber.toLocaleLowerCase('sk') === timetable.trainNumber.toLocaleLowerCase('sk'),
    )
  )
    throw new DisError(409, 'Vlak s týmto číslom už existuje.');
  if (timetable.nextTrainId && !current.some((t) => t.$id === timetable.nextTrainId))
    throw new DisError(400, 'Neplatný nadväzujúci vlak.');
  const report = checkTimetableConflicts(timetable, current);
  if (input.preview) return { report };
  const $id = randomUUID();
  const record = {
    ...timetable,
    $id,
    $updatedAt: new Date().toISOString(),
    _id: JSON.stringify([input.sessionId, timetable.trainNumber.toLocaleLowerCase('sk')]),
    sessionId: input.sessionId,
  };
  try {
    await (await collection()).insertOne(record);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000)
      throw new DisError(409, 'Vlak s týmto číslom už existuje.');
    throw error;
  }
  return { timetable: record, report };
}
