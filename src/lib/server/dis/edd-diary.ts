import type { UserProfile } from '@/lib/dis/appwrite-client';
import {
  eddTimeSchema,
  messageKinds,
  movementPatch,
  stationForms,
  type EddEntry,
  type EddMessage,
  type EddMovement,
} from '@/lib/dis/edd';
import type { EddRecord } from '@/lib/dis/records';
import { getStationDisplayName } from '@/lib/station/display-name';
import { isPublicStation } from '@/lib/station/visibility';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getMongoDb } from '../mongo';
import { sessionRepository } from '../repositories/session-repository';
import { stationRepository } from '../repositories/station-repository';
import { DisError } from './appwrite';
import { requireStationClaim } from './claims';
import { sessionClockSnapshot } from './session-clock';

const identity = z.string().trim().min(1).max(64);
const scope = z.object({ sessionId: identity, stationId: identity });
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s);
const entryKey = (r: Pick<EddRecord, 'sessionId' | 'stationId' | '$id'>) =>
  JSON.stringify([r.sessionId, r.stationId, r.$id]);
export async function diaryEntries() {
  return (await getMongoDb()).collection<EddEntry & { _id: string }>('edd_diary_entries');
}
type StoredMessage = EddMessage & { _id: string; requestDigest: string; responseTo?: string };
let messageIndexes: Promise<unknown> | undefined;
async function messages() {
  const collection = (await getMongoDb()).collection<StoredMessage>('edd_diary_messages');
  messageIndexes ??= Promise.all([
    collection.createIndex({ sessionId: 1, fromStation: 1, createdAt: -1 }),
    collection.createIndex({ sessionId: 1, toStation: 1, createdAt: -1 }),
    collection.createIndex({ sessionId: 1, replyToId: 1 }),
    collection.createIndex(
      { sessionId: 1, responseTo: 1 },
      { unique: true, partialFilterExpression: { responseTo: { $type: 'string' } } },
    ),
  ]).catch((e) => {
    messageIndexes = undefined;
    throw e;
  });
  await messageIndexes;
  return collection;
}

/** Retain Appwrite's existing records/IDs. The revisioned overlay owns new actuals and history. */
export async function projectDiary(
  records: EddRecord[],
  hints = new Map<string, { movement: EddMovement; timetableId: string }>(),
) {
  if (!records.length) return [];
  const collection = await diaryEntries();
  try {
    await collection.bulkWrite(
      records.map((record) => ({
        updateOne: {
          filter: { _id: entryKey(record) },
          update: {
            $setOnInsert: {
              ...record,
              revision: 0,
              movement:
                hints.get(record.$id)?.movement ||
                (!record.schedArrival ? 'origin' : !record.schedDeparture ? 'terminus' : 'stop'),
              notes:
                typeof (record as EddEntry).notes === 'string' ? (record as EddEntry).notes : '',
              history: [],
              eventDates: {},
              ...hints.get(record.$id),
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  } catch (e) {
    if ((e as { code?: number }).code !== 11000) throw e;
  }
  if (hints.size)
    await collection.bulkWrite(
      [...hints].map(([id, hint]) => ({
        updateOne: {
          filter: { _id: entryKey({ ...records[0], $id: id }), revision: 0 },
          update: { $set: hint },
        },
      })),
    );
  const overlay = await collection.find({ _id: { $in: records.map(entryKey) } }).toArray();
  const indexed = new Map(overlay.map((r) => [r.$id, r]));
  return records.map((record) => indexed.get(record.$id)!);
}
export const editDiarySchema = scope.extend({
  id: identity,
  expectedRevision: z.number().int().nonnegative(),
  action: z.enum(['record', 'correct', 'details', 'cancel', 'restore']),
  event: z.enum(['arrival', 'departure', 'passage']).optional(),
  time: eddTimeSchema.optional(),
  date: date.optional(),
  reason: z.string().trim().max(500).default(''),
  track: z.string().trim().max(16).optional(),
  notes: z.string().trim().max(500).optional(),
  movement: z.enum(['stop', 'origin', 'terminus', 'pass']).optional(),
});
export async function editDiary(input: unknown, profile: UserProfile) {
  const c = editDiarySchema.parse(input);
  await requireStationClaim(c.sessionId, c.stationId, profile);
  const collection = await diaryEntries();
  const _id = entryKey({ ...c, $id: c.id });
  const entry = await collection.findOne({ _id });
  if (!entry) throw new DisError(404, 'Záznam nepatrí vybranej stanici.');
  if (entry.revision !== c.expectedRevision)
    throw new DisError(409, 'Záznam zmenil iný používateľ. Obnovte denník.');
  const clock = await sessionClockSnapshot(c.sessionId);
  const before = JSON.stringify({
    status: entry.status,
    arrival: entry.actualArrival,
    departure: entry.actualDeparture,
    track: entry.track,
    notes: entry.notes,
    movement: entry.movement,
    dates: entry.eventDates,
  });
  let patch: Partial<EddEntry> = {};
  if (c.action === 'record' || c.action === 'correct') {
    if (!c.event) throw new DisError(400, 'Vyberte druh pohybu.');
    const correction = c.action === 'correct';
    if (correction && !c.reason) throw new DisError(400, 'Uveďte dôvod opravy.');
    if (correction && !(c.event === 'arrival' ? entry.actualArrival : entry.actualDeparture))
      throw new DisError(400, 'Nie je čo opraviť.');
    if (entry.status === 'cancelled') throw new DisError(409, 'Najprv obnovte zrušený vlak.');
    const actualTime = c.time || clock.time.slice(0, 5);
    const actualDate = c.date || clock.date;
    try {
      patch = movementPatch(entry, c.event, actualTime, correction);
    } catch (e) {
      throw new DisError(409, (e as Error).message);
    }
    patch.eventDates = { ...entry.eventDates, [c.event]: actualDate };
    const arrivalStamp =
      patch.actualArrival &&
      `${patch.eventDates.arrival || actualDate}T${patch.actualArrival.padEnd(8, ':00')}`;
    const departureStamp =
      patch.actualDeparture &&
      `${patch.eventDates.departure || actualDate}T${patch.actualDeparture.padEnd(8, ':00')}`;
    if (arrivalStamp && departureStamp && arrivalStamp > departureStamp)
      throw new DisError(400, 'Odchod je pred príchodom. Skontrolujte dátum a čas.');
  } else if (c.action === 'details') {
    if (
      c.movement &&
      c.movement !== entry.movement &&
      (entry.actualArrival || entry.actualDeparture)
    )
      throw new DisError(409, 'Druh pohybu nemožno meniť po zápise času.');
    patch = {
      ...(c.track !== undefined && { track: c.track }),
      ...(c.notes !== undefined && { notes: c.notes }),
      ...(c.movement && { movement: c.movement }),
    };
  } else {
    if (!c.reason) throw new DisError(400, 'Uveďte dôvod zmeny.');
    if (c.action === 'cancel' && (entry.actualArrival || entry.actualDeparture))
      throw new DisError(409, 'Vlak so zapísaným pohybom nemožno zrušiť.');
    if (c.action === 'restore' && entry.status !== 'cancelled')
      throw new DisError(409, 'Vlak nie je zrušený.');
    patch.status = c.action === 'cancel' ? 'cancelled' : 'scheduled';
  }
  const result = await collection.findOneAndUpdate(
    { _id, revision: c.expectedRevision },
    {
      $set: { ...patch },
      $inc: { revision: 1 },
      $push: {
        history: {
          at: new Date().toISOString(),
          userId: profile.userId,
          operator: profile.name,
          action: c.action + (c.event ? ':' + c.event : ''),
          before,
          after: JSON.stringify(patch),
          reason: c.reason,
          operatingDate: clock.date,
          operatingTime: clock.time,
        },
      },
    },
    { returnDocument: 'after' },
  );
  if (!result) throw new DisError(409, 'Záznam zmenil iný používateľ. Obnovte denník.');
  return { record: result };
}

export async function diaryContacts(sessionId: string, stationId: string) {
  const [stations, session] = await Promise.all([
    stationRepository.listBySessionId(sessionId),
    sessionRepository.findById(sessionId),
  ]);
  const neighbours = new Set<string>();
  for (const link of Object.values(session?.topology.lineblockLinks || {})) {
    if (link.a.stationId === stationId) neighbours.add(link.b.stationId);
    if (link.b.stationId === stationId) neighbours.add(link.a.stationId);
  }
  return stations
    .filter((s) => s.stationId !== stationId && isPublicStation(s.stationId))
    .map((s) => ({
      stationId: s.stationId,
      name: getStationDisplayName(s.stationId),
      neighbour: neighbours.has(s.stationId),
    }))
    .sort(
      (a, b) => Number(b.neighbour) - Number(a.neighbour) || a.name.localeCompare(b.name, 'sk'),
    );
}
export async function listDiaryMessages(sessionId: string, stationId: string) {
  return (await messages())
    .find({ sessionId, $or: [{ fromStation: stationId }, { toStation: stationId }] })
    .sort({ createdAt: -1, _id: -1 })
    .limit(150)
    .toArray();
}
export const sendDiarySchema = scope.extend({
  requestId: z.string().uuid(),
  toStation: identity,
  trainNumber: z.string().trim().min(1).max(32),
  kind: z.enum(messageKinds),
  time: eddTimeSchema.optional(),
  date: date.optional(),
  text: z.string().trim().max(500).default(''),
  replyToId: z.string().max(64).optional(),
  stationLocative: z.string().trim().min(1).max(128).optional(),
  stationGenitive: z.string().trim().min(1).max(128).optional(),
  wholeTrainConfirmed: z.boolean().optional(),
});
export async function sendDiaryMessage(input: unknown, profile: UserProfile) {
  const c = sendDiarySchema.parse(input);
  await requireStationClaim(c.sessionId, c.stationId, profile);
  if (!(await diaryContacts(c.sessionId, c.stationId)).some((s) => s.stationId === c.toStation))
    throw new DisError(400, 'Vyberte platnú cieľovú stanicu.');
  if (c.kind === 'odhlaska' && !c.wholeTrainConfirmed)
    throw new DisError(
      400,
      'Potvrďte, že celý vlak uvoľnil oddiel a sú splnené podmienky odhlášky.',
    );
  if (['note', 'correction', 'cancel', 'wait'].includes(c.kind) && !c.text)
    throw new DisError(400, 'Doplňte text alebo dôvod správy.');
  const collection = await messages();
  const _id = createHash('sha256')
    .update(JSON.stringify([c.sessionId, c.stationId, profile.userId, c.requestId]))
    .digest('hex');
  const requestDigest = createHash('sha256').update(JSON.stringify(c)).digest('hex');
  const previous = await collection.findOne({ _id });
  if (previous) {
    if (previous.requestDigest !== requestDigest)
      throw new DisError(
        409,
        'Predchádzajúca správa už bola odoslaná. Obnovte denník pred ďalšou správou.',
      );
    return { message: previous };
  }
  let original: EddMessage | null = null;
  if (c.replyToId) {
    original = await collection.findOne({ sessionId: c.sessionId, id: c.replyToId });
    const reply = ['accept', 'wait'].includes(c.kind);
    if (
      !original ||
      original.trainNumber !== c.trainNumber ||
      (reply
        ? original.kind !== 'offer' ||
          original.toStation !== c.stationId ||
          original.fromStation !== c.toStation
        : original.fromStation !== c.stationId || original.toStation !== c.toStation)
    )
      throw new DisError(400, 'Správa nepatrí tejto výmene.');
    if (c.kind === 'cancel' && original.kind !== 'offer')
      throw new DisError(400, 'Vyberte pôvodnú ponuku vlaku.');
    if (
      reply &&
      (await collection.findOne({ sessionId: c.sessionId, replyToId: original.id, kind: 'cancel' }))
    )
      throw new DisError(409, 'Ponuka bola zrušená. Vyžiadajte novú ponuku.');
  } else if (['accept', 'wait', 'cancel', 'correction'].includes(c.kind))
    throw new DisError(400, 'Vyberte pôvodnú správu.');
  const clock = await sessionClockSnapshot(c.sessionId);
  const name = getStationDisplayName(c.stationId),
    forms = stationForms(name);
  if (
    !forms.known &&
    ['offer', 'odhlaska', 'expected'].includes(c.kind) &&
    (!c.stationLocative || !c.stationGenitive)
  )
    throw new DisError(400, 'Doplňte skloňovaný názov stanice.');
  const acceptedOffer = c.kind === 'accept' ? original : null;
  const message: EddMessage = {
    id: randomUUID(),
    sessionId: c.sessionId,
    fromStation: c.stationId,
    toStation: c.toStation,
    trainNumber: c.trainNumber,
    kind: c.kind,
    time: acceptedOffer?.time.slice(0, 5) || c.time || clock.time.slice(0, 5),
    date: acceptedOffer?.date || c.date || clock.date,
    createdAt: new Date().toISOString(),
    sentOperatingTime: clock.time.slice(0, 5),
    operator: profile.name,
    userId: profile.userId,
    stationName: acceptedOffer?.stationName || name,
    stationLocative:
      acceptedOffer?.stationLocative ||
      (forms.known ? forms.stationLocative : c.stationLocative || forms.stationLocative),
    stationGenitive:
      acceptedOffer?.stationGenitive ||
      (forms.known ? forms.stationGenitive : c.stationGenitive || forms.stationGenitive),
    text: c.text,
    ...(c.replyToId && { replyToId: c.replyToId }),
  };
  // A deterministic request key makes network retries safe across multiple API instances.
  try {
    await collection.updateOne(
      { _id },
      {
        $setOnInsert: {
          ...message,
          requestDigest,
          ...(['accept', 'wait'].includes(c.kind) && { responseTo: c.replyToId }),
        },
      },
      { upsert: true },
    );
  } catch (e) {
    if ((e as { code?: number }).code === 11000)
      throw new DisError(409, 'Na túto ponuku už bola odoslaná odpoveď. Obnovte denník.');
    throw e;
  }
  const saved = await collection.findOne({ _id });
  if (saved?.requestDigest !== requestDigest)
    throw new DisError(
      409,
      'Predchádzajúca správa už bola odoslaná. Obnovte denník pred ďalšou správou.',
    );
  return { message: saved };
}
export async function receiveDiaryMessage(input: unknown, profile: UserProfile) {
  const c = scope.extend({ id: identity, acknowledge: z.boolean().default(false) }).parse(input);
  await requireStationClaim(c.sessionId, c.stationId, profile);
  const collection = await messages();
  const filter = { sessionId: c.sessionId, toStation: c.stationId, id: c.id };
  const now = new Date().toISOString();
  const clock = await sessionClockSnapshot(c.sessionId);
  await collection.updateOne(
    { ...filter, deliveredAt: { $exists: false } },
    { $set: { deliveredAt: now, deliveredOperatingTime: clock.time.slice(0, 5) } },
  );
  if (c.acknowledge)
    await collection.updateOne(
      { ...filter, acknowledgedAt: { $exists: false } },
      {
        $set: {
          acknowledgedAt: now,
          acknowledgedBy: profile.name,
          acknowledgedOperatingTime: clock.time.slice(0, 5),
        },
      },
    );
  const message = await collection.findOne(filter);
  if (!message) throw new DisError(404, 'Správa nepatrí vybranej stanici.');
  return { message };
}
