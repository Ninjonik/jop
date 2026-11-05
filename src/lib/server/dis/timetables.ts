import { checkTimetableConflicts, normalizeTimetable, type Timetable } from '@/lib/dis/timetable';
import { ID, type Models } from 'node-appwrite';
import { z } from 'zod';
import { databaseId, disDatabase, DisError, listDocuments } from './appwrite';

const commandSchema = z.object({
  id: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/)
    .optional(),
  timetable: z.unknown(),
});

type StoredTimetable = Models.Document & {
  trainNumber: string;
  trainType: string;
  maxSpeed: number;
  trainLength: number;
  stopsJson: string;
};
export async function loadTimetables(): Promise<Timetable[]> {
  const documents = await listDocuments<StoredTimetable>('timetables_gvd');
  return documents.map((document) => {
    try {
      return {
        ...normalizeTimetable({ ...document, stops: JSON.parse(document.stopsJson) }),
        $id: document.$id,
        $updatedAt: document.$updatedAt,
      };
    } catch {
      throw new DisError(
        409,
        `Grafikon ${document.trainNumber} má neplatné údaje. Opravte uložený záznam ${document.$id}.`,
      );
    }
  });
}
export async function saveTimetable(body: unknown) {
  const input = commandSchema.parse(body);
  let timetable;
  try {
    timetable = normalizeTimetable(input.timetable);
  } catch (error) {
    throw new DisError(400, error instanceof Error ? error.message : 'Neplatný grafikon.');
  }
  const others = (await loadTimetables()).filter((item) => item.$id !== input.id);
  if (
    others.some(
      (item) => item.trainNumber.toLocaleLowerCase() === timetable.trainNumber.toLocaleLowerCase(),
    )
  )
    throw new DisError(409, 'Vlak s týmto číslom už existuje. Upravte jeho grafikon.');
  const report = checkTimetableConflicts(timetable, others);
  const payload = {
    trainNumber: timetable.trainNumber,
    trainType: timetable.trainType,
    maxSpeed: timetable.maxSpeed,
    trainLength: timetable.trainLength,
    routeTitle: `${timetable.stops[0].station} – ${timetable.stops.at(-1)!.station}`,
    stopsJson: JSON.stringify(timetable.stops),
    hasConflict: report.conflicts.length > 0,
    conflictDetails: report.conflicts
      .map((conflict) => conflict.message)
      .join('\n')
      .slice(0, 1000),
  };
  if (payload.routeTitle.length > 128 || payload.stopsJson.length > 20000)
    throw new DisError(400, 'Grafikon prekračuje povolenú veľkosť.');
  const db = disDatabase();
  const saved = input.id
    ? await db.updateDocument(databaseId, 'timetables_gvd', input.id, payload)
    : await db.createDocument(databaseId, 'timetables_gvd', ID.unique(), payload);
  return { timetable: { ...timetable, $id: saved.$id, $updatedAt: saved.$updatedAt }, report };
}

export async function previewTimetable(body: unknown) {
  const input = commandSchema.parse(body);
  let timetable;
  try {
    timetable = normalizeTimetable(input.timetable);
  } catch (error) {
    throw new DisError(400, error instanceof Error ? error.message : 'Neplatný grafikon.');
  }
  return {
    report: checkTimetableConflicts(
      timetable,
      (await loadTimetables()).filter((item) => item.$id !== input.id),
    ),
  };
}
