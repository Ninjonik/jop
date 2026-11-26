import { z } from 'zod';
import type { EddRecord } from './records';

export const eddTimeSchema = z
  .string()
  .transform((value) => {
    const text = value.trim().replace('.', ':');
    return /^\d{3,4}$/.test(text) ? `${text.padStart(4, '0').slice(0, 2)}:${text.slice(-2)}` : text;
  })
  .pipe(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Čas musí mať formát HH:mm.'));
/** Read old records without rewriting them; new diary commands are minute-only. */
export const recordedEddTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/);
export const eddClock = (time?: string) => (time ? time.slice(0, 5) : '—');
export type EddMovement = 'stop' | 'origin' | 'terminus' | 'pass';
export type EddEvent = 'arrival' | 'departure' | 'passage';
export type EddAudit = {
  at: string;
  operator: string;
  userId: string;
  action: string;
  before: string;
  after: string;
  reason: string;
  operatingDate: string;
  operatingTime: string;
};
export type EddEntry = EddRecord & {
  revision: number;
  movement: EddMovement;
  notes: string;
  history: EddAudit[];
  eventDates: Partial<Record<EddEvent, string>>;
  timetableId?: string;
};
export function canRecord(entry: EddEntry, event: EddEvent) {
  if (['cancelled', 'departed', 'passed'].includes(entry.status)) return false;
  if (event === 'arrival')
    return !entry.actualArrival && ['stop', 'terminus'].includes(entry.movement);
  if (event === 'passage') return entry.movement === 'pass';
  return (
    !entry.actualDeparture &&
    (entry.movement === 'origin' || (entry.movement === 'stop' && !!entry.actualArrival))
  );
}
export function timeSeconds(time: string) {
  const [h, m, s = 0] = time.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}
export function movementPatch(entry: EddEntry, event: EddEvent, time: string, correction = false) {
  if (!correction && !canRecord(entry, event))
    throw new Error('Úkon nezodpovedá stavu vlaku. Obnovte denník.');
  if (
    (event === 'arrival' && !['stop', 'terminus'].includes(entry.movement)) ||
    (event === 'departure' && !['stop', 'origin'].includes(entry.movement)) ||
    (event === 'passage' && entry.movement !== 'pass')
  )
    throw new Error('Tento druh pohybu nepatrí vlaku.');
  const planned = event === 'arrival' ? entry.schedArrival : entry.schedDeparture;
  const delay = planned ? ((timeSeconds(time) - timeSeconds(planned) + 129600) % 86400) - 43200 : 0;
  return {
    actualArrival: event === 'arrival' ? time : entry.actualArrival,
    actualDeparture: event === 'arrival' ? entry.actualDeparture : time,
    status:
      event === 'passage'
        ? ('passed' as const)
        : event === 'arrival'
          ? entry.actualDeparture
            ? ('departed' as const)
            : ('arrived' as const)
          : ('departed' as const),
    delayMinutes: Math.max(0, Math.round(delay / 60)),
  };
}

export const messageKinds = [
  'offer',
  'accept',
  'wait',
  'expected',
  'arrival',
  'departure',
  'odhlaska',
  'query',
  'occupied',
  'cancel',
  'correction',
  'note',
] as const;
export type EddMessageKind = (typeof messageKinds)[number];
export const messageLabels: Record<EddMessageKind, string> = {
  offer: 'Ponuka vlaku',
  accept: 'Prijatie vlaku',
  wait: 'Čakajte',
  expected: 'Predvídaný odchod',
  arrival: 'Hlásenie príchodu',
  departure: 'Hlásenie odchodu',
  odhlaska: 'Odhláška (uvoľnenie oddielu)',
  query: 'Dopyt na vlak',
  occupied: 'Trať obsadená',
  cancel: 'Zrušenie prijatia',
  correction: 'Oprava správy',
  note: 'Voľná správa',
};
export type EddMessage = {
  id: string;
  sessionId: string;
  fromStation: string;
  toStation: string;
  trainNumber: string;
  kind: EddMessageKind;
  time: string;
  date: string;
  createdAt: string;
  operator: string;
  userId: string;
  stationName: string;
  stationLocative: string;
  stationGenitive: string;
  text: string;
  replyToId?: string;
  deliveredAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  sentOperatingTime?: string;
  deliveredOperatingTime?: string;
  acknowledgedOperatingTime?: string;
};
// Only verified local names are declined automatically. Other places use explicit editable forms.
const forms: Record<string, [string, string]> = {
  Kolárovo: ['Kolárove', 'Kolárova'],
  Veselé: ['Veselom', 'Veselého'],
  Milošov: ['Milošove', 'Milošova'],
  Lubina: ['Lubine', 'Lubiny'],
  Klenov: ['Klenove', 'Klenova'],
  Nadeždovo: ['Nadeždove', 'Nadeždova'],
  Kameňany: ['Kameňanoch', 'Kameňan'],
  Prílohy: ['Prílohách', 'Príloh'],
  Streženice: ['Streženiciach', 'Streženíc'],
  Rančiská: ['Rančiskách', 'Rančísk'],
  Teriakovce: ['Teriakovciach', 'Teriakoviec'],
  'Teriakovské Kľačany': ['Teriakovských Kľačanoch', 'Teriakovských Kľačian'],
};
export function stationForms(name: string) {
  const pair = forms[name];
  return {
    stationName: name,
    stationLocative: pair?.[0] || name,
    stationGenitive: pair?.[1] || name,
    known: !!pair,
  };
}
/** English is a game translation. Prescribed Slovak patterns: D2 483–484; Z1 746. Other notices are labelled game adaptations. */
export function formatEddMessage(
  m: EddMessage,
  locale: 'sk' | 'en',
  acknowledgement = false,
): string {
  const n = m.trainNumber,
    t = m.time.slice(0, 5),
    who = acknowledgement ? m.acknowledgedBy || '' : m.operator;
  if (acknowledgement) {
    if (m.kind === 'odhlaska')
      return locale === 'sk'
        ? `Vlak ${n} v ${m.stationLocative}, rozumel ${who}.`
        : `Train ${n} at ${m.stationName}, understood. ${who}.`;
    return locale === 'sk'
      ? `Rozumel: ${formatEddMessage(m, locale)} — ${who}.`
      : `Understood: ${formatEddMessage(m, locale)} — ${who}.`;
  }
  if (locale === 'en') {
    const messages: Record<EddMessageKind, string> = {
      offer: `Will you accept train ${n} departing ${m.stationName} at ${t}?`,
      accept: `Yes, I accept train ${n} departing ${m.stationName} at ${t}.`,
      wait: 'No, wait.',
      expected: `Expected departure of train ${n} from ${m.stationName}: ${t}.`,
      arrival: `Train ${n} arrived at ${m.stationName} at ${t}.`,
      departure: `Train ${n} departed ${m.stationName} at ${t}.`,
      odhlaska: `Train ${n} at ${m.stationName}.`,
      query: `Has train ${n} arrived?`,
      occupied: 'Section occupied.',
      cancel: `Acceptance and expected departure of train ${n} cancelled.`,
      correction: `Correction: ${m.text}`,
      note: m.text,
    };
    return `${messages[m.kind]} ${who}.${m.text && !['note', 'correction'].includes(m.kind) ? ` ${m.text}` : ''}`;
  }
  const messages: Record<EddMessageKind, string> = {
    offer: `Prijmete vlak ${n} s odchodom z ${m.stationGenitive} o ${t}?`,
    accept: `Áno, prijímam vlak ${n} s odchodom z ${m.stationGenitive} o ${t}.`,
    wait: 'Nie, čakajte.',
    expected: `Predvídaný odchod vlaku ${n} z ${m.stationGenitive} o ${t}.`,
    arrival: `Vlak ${n} prišiel do stanice ${m.stationName} o ${t}.`,
    departure: `Vlak ${n} odišiel zo stanice ${m.stationName} o ${t}.`,
    odhlaska: `Vlak ${n} v ${m.stationLocative}.`,
    query: `Došiel vlak ${n}?`,
    occupied: 'Trať obsadená.',
    cancel: `Ruším prijatie a predvídaný odchod vlaku ${n}.`,
    correction: `Oprava: ${m.text}`,
    note: m.text,
  };
  return `${messages[m.kind]} ${who}.${m.text && !['note', 'correction'].includes(m.kind) ? ` ${m.text}` : ''}`;
}

export function inferMovement(stop: { kind?: string }, index: number, length: number): EddMovement {
  return index === 0
    ? 'origin'
    : index === length - 1
      ? 'terminus'
      : stop.kind === 'pass'
        ? 'pass'
        : 'stop';
}
