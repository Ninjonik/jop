import { newPlanning } from '@/lib/dis/gvd-planning';
import { validateGvdPlan } from '@/lib/dis/gvd-validation';
import { checkTimetableConflicts, normalizeTimetable, type Timetable } from '@/lib/dis/timetable';
import { kamenanskoTransportPoints } from '@/lib/dis/transport-points';
import { isPublicStation } from '@/lib/station/visibility';
import { ID, type Models } from 'node-appwrite';
import { z } from 'zod';
import { getMongoDb } from '../mongo';
import { databaseId, disDatabase, DisError, listDocuments } from './appwrite';
import { loadLines } from './lines';
import { getDisPlaceTemplate } from './places';
import { loadRailwayNetwork } from './railway-network';

const commandSchema = z.object({
  placeId: z.string().regex(/^[1-9]\d{0,31}$/),
  id: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/)
    .optional(),
  timetable: z.unknown(),
  expectedUpdatedAt: z.string().optional(),
});

type StoredTimetable = Models.Document & {
  placeId?: string;
  trainNumber: string;
  trainType: string;
  maxSpeed: number;
  trainLength: number;
  stopsJson: string;
  planningJson?: string;
  nextTrainId?: string | null;
  notes?: string | null;
};
export async function loadTimetables(
  placeId: string,
  includeInactive = false,
): Promise<Timetable[]> {
  if (!/^[1-9]\d{0,31}$/.test(placeId)) throw new DisError(400, 'Vyberte platné miesto.');
  const documents = await listDocuments<StoredTimetable>('timetables_gvd');
  return documents
    .filter((document) => document.placeId === placeId)
    .map((document) => {
      try {
        return {
          ...normalizeTimetable({
            ...document,
            nextTrainId: document.nextTrainId || undefined,
            notes: document.notes || undefined,
            stops: JSON.parse(document.stopsJson),
            planning: document.planningJson ? JSON.parse(document.planningJson) : undefined,
          }),
          $id: document.$id,
          $updatedAt: document.$updatedAt,
        };
      } catch {
        throw new DisError(
          409,
          `Grafikon ${document.trainNumber} má neplatné údaje. Opravte uložený záznam ${document.$id}.`,
        );
      }
    })
    .filter((t) => includeInactive || !t.planning || t.planning.status === 'active');
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
  const current = await loadTimetables(input.placeId, true);
  if (input.id && !current.some((item) => item.$id === input.id))
    throw new DisError(404, 'Grafikon nepatrí vybranému miestu.');
  if (
    input.id &&
    input.expectedUpdatedAt &&
    current.find((t) => t.$id === input.id)?.$updatedAt !== input.expectedUpdatedAt
  )
    throw new DisError(409, 'Vlak medzitým zmenil iný používateľ. Obnovte uloženú verziu.');
  const others = current.filter((item) => item.$id !== input.id);
  const previous = current.find((item) => item.$id === input.id);
  if (
    previous &&
    (previous.trainNumber !== timetable.trainNumber ||
      (timetable.planning && timetable.planning.status !== 'active'))
  )
    await assertTimetableNotDriven(input.id!);
  validateNextTrain(timetable, input.id, current);
  if (
    others.some(
      (item) => item.trainNumber.toLocaleLowerCase() === timetable.trainNumber.toLocaleLowerCase(),
    )
  )
    throw new DisError(409, 'Vlak s týmto číslom už existuje. Upravte jeho grafikon.');
  const report = timetable.planning
    ? validateGvdPlan(timetable, others, await loadLines(input.placeId))
    : checkTimetableConflicts(timetable, others);
  const payload = {
    placeId: input.placeId,
    trainNumber: timetable.trainNumber,
    trainType: timetable.trainType,
    maxSpeed: timetable.maxSpeed,
    trainLength: timetable.trainLength,
    nextTrainId: timetable.nextTrainId || '',
    notes: timetable.notes || '',
    routeTitle: `${timetable.stops[0].station} – ${timetable.stops.at(-1)!.station}`,
    stopsJson: JSON.stringify(timetable.stops),
    ...(timetable.planning ? { planningJson: JSON.stringify(timetable.planning) } : {}),
    hasConflict: report.conflicts.length > 0,
    conflictDetails: report.conflicts
      .map((conflict) => conflict.message)
      .join('\n')
      .slice(0, 1000),
  };
  if (payload.routeTitle.length > 128 || payload.stopsJson.length > 20000)
    throw new DisError(400, 'Grafikon prekračuje povolenú veľkosť.');
  const db = disDatabase();
  if (timetable.planning) {
    try {
      const attribute = await db.getAttribute({
        databaseId,
        collectionId: 'timetables_gvd',
        key: 'planningJson',
      });
      if (attribute.status !== 'available') throw new Error('pending');
    } catch {
      throw new DisError(
        503,
        'Rozšírené GVD ešte nie je pripravené. Správca musí dokončiť prípravu databázy GVD; návrh zostáva neuložený.',
      );
    }
  }
  if (JSON.stringify(payload).length > 55000)
    throw new DisError(400, 'Grafikon prekračuje povolenú veľkosť.');
  let saved;
  if (input.id && input.expectedUpdatedAt) {
    const transaction = await db.createTransaction({ ttl: 60 });
    try {
      const record = await db.getDocument({
        databaseId,
        collectionId: 'timetables_gvd',
        documentId: input.id,
        transactionId: transaction.$id,
      });
      if (record.$updatedAt !== input.expectedUpdatedAt)
        throw new DisError(409, 'Vlak medzitým zmenil iný používateľ. Obnovte uloženú verziu.');
      await db.updateDocument({
        databaseId,
        collectionId: 'timetables_gvd',
        documentId: input.id,
        data: payload,
        transactionId: transaction.$id,
      });
      await db.updateTransaction({ transactionId: transaction.$id, commit: true });
      saved = await db.getDocument(databaseId, 'timetables_gvd', input.id);
    } catch (error) {
      await db
        .updateTransaction({ transactionId: transaction.$id, rollback: true })
        .catch(() => {});
      throw error;
    }
  } else
    saved = input.id
      ? await db.updateDocument(databaseId, 'timetables_gvd', input.id, payload)
      : await db.createDocument(databaseId, 'timetables_gvd', ID.unique(), payload);
  return { timetable: { ...timetable, $id: saved.$id, $updatedAt: saved.$updatedAt }, report };
}

/** Keep a driver's lease and GSM-R timetable identity valid during authoring. */
export async function assertTimetableNotDriven(timetableId: string, sessionId?: string) {
  const active = await (
    await getMongoDb()
  )
    .collection('session_driver_trains')
    .findOne({ timetableId, ...(sessionId ? { sessionId } : {}), expiresAt: { $gt: Date.now() } });
  if (active)
    throw new DisError(
      409,
      'Vlak práve používa rušňovodič. Pred prečíslovaním alebo vyradením ukončite jeho výkon.',
    );
}

/** Retirement preserves IDs, saved shift snapshots, EDD actuals and radio bindings. */
export async function retireTimetable(body: unknown) {
  const input = z
    .object({ placeId: z.string(), id: z.string(), expectedUpdatedAt: z.string() })
    .parse(body);
  const current = await loadTimetables(input.placeId, true);
  const train = current.find((t) => t.$id === input.id);
  if (!train) throw new DisError(404, 'Vlak neexistuje.');
  const dependents = current.filter((t) => t.nextTrainId === input.id).map((t) => t.trainNumber);
  const result = await saveTimetable({
    ...input,
    timetable: { ...train, planning: { ...(train.planning || newPlanning()), status: 'retired' } },
  });
  return { ...result, dependents };
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
  const current = await loadTimetables(input.placeId, true);
  validateNextTrain(timetable, input.id, current);
  if (input.id && !current.some((item) => item.$id === input.id))
    throw new DisError(404, 'Grafikon nepatrí vybranému miestu.');
  return {
    report: timetable.planning
      ? validateGvdPlan(
          timetable,
          current.filter((item) => item.$id !== input.id),
          await loadLines(input.placeId),
        )
      : checkTimetableConflicts(
          timetable,
          current.filter((item) => item.$id !== input.id),
        ),
  };
}

export async function validateTimetablePlace(placeId: string, stops: string[]) {
  const template = await getDisPlaceTemplate(placeId);
  if (!template) throw new DisError(404, 'Miesto nemá uloženú konfiguráciu staníc.');
  const stations = new Set(
    template.schema.stations
      .filter((station) => isPublicStation(station.stationId))
      .map((station) => station.stationId),
  );
  // Timetable-only stops need not have a dispatchable runtime station layout.
  if (placeId === '113144512557419') {
    for (const point of kamenanskoTransportPoints) stations.add(point.stationId);
  }
  const network = await loadRailwayNetwork(placeId);
  for (const point of network.network.points) stations.add(point.id);
  if (stops.some((station) => !stations.has(station)))
    throw new DisError(400, 'Grafikon obsahuje stanicu mimo vybraného miesta.');
}

function validateNextTrain(
  timetable: { nextTrainId?: string },
  id: string | undefined,
  current: Timetable[],
) {
  if (!timetable.nextTrainId) return;
  if (timetable.nextTrainId === id)
    throw new DisError(400, 'Nadväzujúci vlak nemôže byť ten istý vlak.');
  if (!current.some((train) => train.$id === timetable.nextTrainId))
    throw new DisError(400, 'Nadväzujúci vlak musí byť uložený v rovnakom GVD.');
}

export async function deleteTimetable(body: unknown) {
  const input = z
    .object({ placeId: z.string(), id: z.string(), expectedUpdatedAt: z.string() })
    .parse(body);
  const current = await loadTimetables(input.placeId, true);
  const train = current.find((t) => t.$id === input.id);
  if (!train) throw new DisError(404, 'Vlak neexistuje.');
  await assertTimetableNotDriven(input.id);
  if (current.some((t) => t.nextTrainId === input.id))
    throw new DisError(409, 'Najprv odstráňte nadväznosť ostatných vlakov.');
  const db = disDatabase();
  const transaction = await db.createTransaction({ ttl: 60 });
  try {
    const record = await db.getDocument({
      databaseId,
      collectionId: 'timetables_gvd',
      documentId: input.id,
      transactionId: transaction.$id,
    });
    if (record.$updatedAt !== input.expectedUpdatedAt)
      throw new DisError(409, 'Vlak medzitým zmenil iný používateľ. Obnovte uloženú verziu.');
    await db.deleteDocument({
      databaseId,
      collectionId: 'timetables_gvd',
      documentId: input.id,
      transactionId: transaction.$id,
    });
    await db.updateTransaction({ transactionId: transaction.$id, commit: true });
  } catch (error) {
    await db.updateTransaction({ transactionId: transaction.$id, rollback: true }).catch(() => {});
    throw error;
  }
  return { deleted: true };
}
