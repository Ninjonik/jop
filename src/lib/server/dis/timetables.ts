import { checkTimetableConflicts, normalizeTimetable, type Timetable } from '@/lib/dis/timetable';
import { ID, type Models } from 'node-appwrite';
import { z } from 'zod';
import { databaseId, disDatabase, DisError, listDocuments } from './appwrite';
import { getDisPlaceTemplate } from './places';

const commandSchema = z.object({
  placeId: z.string().regex(/^[1-9]\d{0,31}$/),
  id: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/)
    .optional(),
  timetable: z.unknown(),
});

type StoredTimetable = Models.Document & {
  placeId?: string;
  trainNumber: string;
  trainType: string;
  maxSpeed: number;
  trainLength: number;
  stopsJson: string;
};
export async function loadTimetables(placeId: string): Promise<Timetable[]> {
  if (!/^[1-9]\d{0,31}$/.test(placeId)) throw new DisError(400, 'Vyberte platné miesto.');
  const documents = await listDocuments<StoredTimetable>('timetables_gvd');
  return documents
    .filter((document) => document.placeId === placeId)
    .map((document) => {
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
  await validateTimetablePlace(
    input.placeId,
    timetable.stops.map((stop) => stop.station),
  );
  const current = await loadTimetables(input.placeId);
  if (input.id && !current.some((item) => item.$id === input.id))
    throw new DisError(404, 'Grafikon nepatrí vybranému miestu.');
  const others = current.filter((item) => item.$id !== input.id);
  if (
    others.some(
      (item) => item.trainNumber.toLocaleLowerCase() === timetable.trainNumber.toLocaleLowerCase(),
    )
  )
    throw new DisError(409, 'Vlak s týmto číslom už existuje. Upravte jeho grafikon.');
  const report = checkTimetableConflicts(timetable, others);
  const payload = {
    placeId: input.placeId,
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
  await validateTimetablePlace(
    input.placeId,
    timetable.stops.map((stop) => stop.station),
  );
  const current = await loadTimetables(input.placeId);
  if (input.id && !current.some((item) => item.$id === input.id))
    throw new DisError(404, 'Grafikon nepatrí vybranému miestu.');
  return {
    report: checkTimetableConflicts(
      timetable,
      current.filter((item) => item.$id !== input.id),
    ),
  };
}

async function validateTimetablePlace(placeId: string, stops: string[]) {
  const template = await getDisPlaceTemplate(placeId);
  if (!template) throw new DisError(404, 'Miesto nemá uloženú konfiguráciu staníc.');
  const stations = new Set(template.schema.stations.map((station) => station.stationId));
  if (stops.some((station) => !stations.has(station)))
    throw new DisError(400, 'Grafikon obsahuje stanicu mimo vybraného miesta.');
}
