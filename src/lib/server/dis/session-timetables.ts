import { validateGvdPlan } from '@/lib/dis/gvd-validation';
import type { TimetableInput } from '@/lib/dis/timetable';
import { checkTimetableConflicts, normalizeTimetable } from '@/lib/dis/timetable';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getMongoDb } from '../mongo';
import { DisError } from './appwrite';
import { requireLiveSession } from './claims';
import { loadLines } from './lines';
import { assertTimetableNotDriven, loadTimetables, validateTimetablePlace } from './timetables';

type SessionTimetable = TimetableInput & {
  _id: string;
  sessionId: string;
  id: string;
  updatedAt: string;
};
async function collection() {
  return (await getMongoDb()).collection<SessionTimetable>('session_timetables');
}
async function sessionTrains(sessionId: string) {
  // Legacy documents used Appwrite-style $id fields. Project them to ordinary
  // names before BSON decoding (otherwise they can be mistaken for DBRefs).
  const documents = await (
    await collection()
  )
    .aggregate<SessionTimetable>([
      { $match: { sessionId } },
      {
        $project: {
          _id: 1,
          sessionId: 1,
          trainNumber: 1,
          trainType: 1,
          maxSpeed: 1,
          trainLength: 1,
          stops: 1,
          nextTrainId: 1,
          notes: 1,
          planning: 1,
          id: { $ifNull: ['$id', { $getField: { $literal: '$id' } }] },
          updatedAt: { $ifNull: ['$updatedAt', { $getField: { $literal: '$updatedAt' } }] },
        },
      },
    ])
    .toArray();
  return documents.map(({ id, updatedAt, ...train }) => ({
    ...train,
    $id: id,
    $updatedAt: updatedAt,
  }));
}
export async function loadOperatingTimetables(sessionId: string, includeInactive = false) {
  const session = await requireLiveSession(sessionId);
  if (session.interpreter.kind !== 'roblox') return [];
  const [daily, additional] = await Promise.all([
    loadTimetables(session.interpreter.placeId, includeInactive),
    sessionTrains(sessionId),
  ]);
  return [...daily, ...additional].filter(
    (t) => includeInactive || !t.planning || t.planning.status === 'active',
  );
}
export async function saveSessionTimetable(body: unknown) {
  const input = z
    .object({
      sessionId: z.string().min(1).max(64),
      timetable: z.unknown(),
      preview: z.boolean().default(false),
      id: z.uuid().optional(),
      expectedUpdatedAt: z.string().optional(),
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
  const current = await loadOperatingTimetables(input.sessionId, true);
  const existing = input.id
    ? (await sessionTrains(input.sessionId)).find((t) => t.$id === input.id)
    : undefined;
  if (input.id && !existing) throw new DisError(404, 'Vlak nepatrí tejto relácii.');
  if (
    existing &&
    (existing.trainNumber !== timetable.trainNumber ||
      (timetable.planning && timetable.planning.status !== 'active'))
  )
    await assertTimetableNotDriven(input.id!, input.sessionId);
  if (
    current.some(
      (t) =>
        t.$id !== input.id &&
        t.trainNumber.toLocaleLowerCase('sk') === timetable.trainNumber.toLocaleLowerCase('sk'),
    )
  )
    throw new DisError(409, 'Vlak s týmto číslom už existuje.');
  if (timetable.nextTrainId && !current.some((t) => t.$id === timetable.nextTrainId))
    throw new DisError(400, 'Neplatný nadväzujúci vlak.');
  if (input.id && timetable.nextTrainId === input.id)
    throw new DisError(400, 'Nadväzujúci vlak nemôže byť ten istý vlak.');
  const others = current.filter((t) => t.$id !== input.id);
  const report = timetable.planning
    ? validateGvdPlan(timetable, others, await loadLines(session.interpreter.placeId))
    : checkTimetableConflicts(timetable, others);
  if (input.preview) return { report };
  const $id = input.id || randomUUID();
  const record = {
    ...timetable,
    id: $id,
    updatedAt: new Date(
      Math.max(Date.now(), (Date.parse(existing?.$updatedAt || '') || 0) + 1),
    ).toISOString(),
    _id: existing?._id || JSON.stringify([input.sessionId, $id]),
    sessionId: input.sessionId,
  };
  try {
    if (existing) {
      if (!input.expectedUpdatedAt) throw new DisError(409, 'Obnovte uloženú verziu vlaku.');
      const { _id, ...replacement } = record;
      const saved = await (
        await collection()
      ).replaceOne(
        {
          _id,
          $expr: {
            $eq: [
              { $ifNull: ['$updatedAt', { $getField: { $literal: '$updatedAt' } }] },
              input.expectedUpdatedAt,
            ],
          },
        },
        replacement,
      );
      if (!saved.matchedCount) throw new DisError(409, 'Vlak medzitým zmenil iný používateľ.');
    } else await (await collection()).insertOne(record);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 11000)
      throw new DisError(409, 'Vlak s týmto číslom už existuje.');
    throw error;
  }
  return {
    timetable: {
      ...timetable,
      $id: record.id,
      $updatedAt: record.updatedAt,
      sessionId: record.sessionId,
    },
    report,
  };
}
