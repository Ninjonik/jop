import type { EddSnapshot } from '@/app/components/dis/EddWorkstation';
import type { ChatMessage } from '@/lib/dis/chat';
import { operatingClockParts } from '@/lib/dis/clock';
import {
  canRecord,
  eddTimeSchema,
  formatEddMessage,
  movementPatch,
  stationForms,
  type EddEntry,
  type EddMessage,
} from '@/lib/dis/edd';
import type { Timetable } from '@/lib/dis/timetable';
const sessionId = 'edd-preview';
const rows: EddEntry[] = [];
for (const stationId of ['kolarovo', 'vesele'])
  for (const [trainNumber, movement, schedArrival, schedDeparture] of [
    ['5849', stationId === 'kolarovo' ? 'origin' : 'stop', '15:00', '15:01'],
    ['3150', 'terminus', '15:12', ''],
    ['6206', 'pass', '15:20', '15:20'],
    ['90001', 'stop', '15:30', '15:32'],
  ] as const)
    rows.push({
      $id: `${stationId}-${trainNumber}`,
      sessionId,
      stationId,
      trainNumber,
      trainType: 'Os',
      movement,
      schedArrival,
      schedDeparture,
      actualArrival: '',
      actualDeparture: '',
      track: trainNumber === '90001' ? '' : '1',
      status: 'scheduled',
      direction: 'Kolárovo → Veselé',
      nextTransportPoint:
        movement === 'terminus' ? undefined : stationId === 'kolarovo' ? 'Štefanovo z' : 'Kolárovo',
      nextControlledArea:
        movement === 'terminus' ? undefined : stationId === 'kolarovo' ? 'Veselé' : 'Kolárovo',
      delayMinutes: 0,
      revision: 0,
      notes: '',
      history: [],
      eventDates: {},
    });
const stop = (
  station: string,
  arrival: string,
  departure: string,
  kind: 'stop' | 'pass' = 'stop',
) => ({ station, arrival, departure, track: station === 'stefanovo' ? '' : '1', kind });
const timetables: Timetable[] = [
  {
    $id: 'preview-5849',
    trainNumber: '5849',
    trainType: 'Os',
    maxSpeed: 100,
    trainLength: 180,
    stops: [
      stop('kolarovo', '', '15:01'),
      stop('stefanovo', '15:05', '15:05', 'pass'),
      stop('vesele', '15:10', ''),
    ],
  },
  {
    $id: 'preview-3150',
    trainNumber: '3150',
    trainType: 'Os',
    maxSpeed: 100,
    trainLength: 180,
    stops: [
      stop('vesele', '', '15:00'),
      stop('stefanovo', '15:08', '15:08', 'pass'),
      stop('kolarovo', '15:12', ''),
    ],
  },
  {
    $id: 'preview-6206',
    trainNumber: '6206',
    trainType: 'Os',
    maxSpeed: 100,
    trainLength: 180,
    stops: [
      stop('lubina', '', '15:10'),
      stop('kolarovo', '15:20', '15:20', 'pass'),
      stop('stefanovo', '15:24', '15:24', 'pass'),
      stop('vesele', '15:28', ''),
    ],
  },
  {
    $id: 'preview-90001',
    trainNumber: '90001',
    trainType: 'Mn',
    maxSpeed: 80,
    trainLength: 180,
    stops: [
      stop('lubina', '', '15:20'),
      stop('kolarovo', '15:30', '15:32'),
      stop('stefanovo', '15:36', '15:36', 'pass'),
      stop('vesele', '15:40', ''),
    ],
  },
];
for (const row of rows) {
  const train = timetables.find((t) => t.trainNumber === row.trainNumber)!;
  const index = train.stops.findIndex((s) => s.station === row.stationId);
  const point = train.stops[index];
  row.timetableId = train.$id;
  row.schedArrival = point.arrival;
  row.schedDeparture = point.departure;
  row.movement =
    index === 0
      ? 'origin'
      : index === train.stops.length - 1
        ? 'terminus'
        : point.kind === 'pass'
          ? 'pass'
          : 'stop';
  row.trainType = train.trainType;
  row.direction =
    train.stops[0].station === 'vesele' ? 'Veselé → Kolárovo' : 'Lubina / Kolárovo → Veselé';
}
// One upstream +6 report demonstrates propagation without turning estimates into actuals.
Object.assign(
  rows.find((r) => r.stationId === 'kolarovo' && r.trainNumber === '5849')!,
  { actualDeparture: '15:07', status: 'departed', revision: 1 },
);
const messages: EddMessage[] = [];
const plainMessages: ChatMessage[] = [];
export function previewChatHistory(stationId: string, target: string): ChatMessage[] {
  return [
    ...plainMessages,
    ...messages.map((edd) => ({
      _id: edd.id,
      sessionId,
      sender: { kind: 'station' as const, id: edd.fromStation, name: edd.fromStation },
      recipient: { kind: 'station' as const, id: edd.toStation, name: edd.toStation },
      senderUserId: edd.userId,
      senderName: edd.operator,
      senderRole: 'dispatcher' as const,
      content: formatEddMessage(edd, 'sk'),
      createdAt: edd.createdAt,
      edd,
    })),
  ]
    .filter(
      (message) =>
        (message.sender.id === stationId && message.recipient.id === target) ||
        (message.sender.id === target && message.recipient.id === stationId),
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
export function previewPlainMessage(stationId: string, target: string, content: string) {
  plainMessages.push({
    _id: crypto.randomUUID(),
    sessionId,
    sender: { kind: 'station', id: stationId, name: stationId },
    recipient: { kind: 'station', id: target, name: target },
    senderName: stationId === 'kolarovo' ? 'Novák' : 'Kováč',
    senderUserId: stationId,
    content,
    createdAt: new Date().toISOString(),
  });
}
const requests = new Map<string, EddMessage>();
const preferences = new Map<string, unknown>();
export let failNext = false;
export function simulateFailure() {
  failNext = true;
}
const sampleStart = operatingClockParts();
let offsetMinutes =
  15 * 60 +
  15 -
  (Number(sampleStart.minuteTime.slice(0, 2)) * 60 + Number(sampleStart.minuteTime.slice(3, 5)));
function clock() {
  return {
    sessionId,
    offsetMinutes,
    configured: false,
    serverUnixMs: Date.now(),
    ...operatingClockParts(offsetMinutes),
  };
}
export async function disFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const parsed = new URL(url, location.origin),
    path = parsed.pathname;
  const c = init.body ? JSON.parse(String(init.body)) : null;
  if (c && failNext) {
    failNext = false;
    throw new Error('Skúšobné zlyhanie uloženia. Skúste znova.');
  }
  if (path === '/api/dis/traffic')
    return structuredClone({
      timetables,
      records: rows,
      drivers: [
        {
          sessionId,
          userId: 'sample-driver',
          userName: 'Novák · SAMPLE',
          trainNumber: '5849',
          trainType: 'Os',
          timetableId: 'preview-5849',
          tonnage: 210,
        },
      ],
      clock: clock(),
    }) as T;
  if (path === '/api/dis/lines')
    return {
      lines: [
        {
          id: '52a915da-d070-4b08-b742-3a2d806ae258',
          placeId: '113144512557419',
          name: 'Kolárovo — Veselé',
          stations: ['lubina', 'kolarovo', 'stefanovo', 'vesele'],
        },
      ],
    } as T;
  if (path === '/api/dis/session-clock') return { clock: clock() } as T;
  if (path === '/api/dis/preferences') {
    if (c) preferences.set(c.key, c.value);
    return { value: preferences.get(c?.key || parsed.searchParams.get('key')!) || null } as T;
  }
  if (path !== '/api/dis/edd') throw new Error('Unknown fixture API');
  const stationId = c?.stationId || parsed.searchParams.get('stationId')!;
  if (!c)
    return structuredClone({
      canWrite: true,
      operator: stationId === 'kolarovo' ? 'Novák' : 'Kováč',
      records: rows.filter((r) => r.stationId === stationId),
      messages: messages
        .filter((m) => m.fromStation === stationId || m.toStation === stationId)
        .slice()
        .reverse(),
      contacts: [
        {
          stationId: stationId === 'kolarovo' ? 'vesele' : 'kolarovo',
          name: stationId === 'kolarovo' ? 'Veselé' : 'Kolárovo',
          neighbour: true,
        },
      ],
    } satisfies EddSnapshot) as T;
  if (c.command === 'create') {
    rows.push({
      ...rows[0],
      ...c,
      $id: crypto.randomUUID(),
      movement: !c.schedArrival ? 'origin' : !c.schedDeparture ? 'terminus' : 'stop',
      actualArrival: '',
      actualDeparture: '',
      history: [],
      revision: 0,
      eventDates: {},
    });
  } else if (c.command === 'record' || c.command === 'edit') {
    const r = rows.find((r) => r.$id === c.id && r.stationId === stationId)!;
    if (r.revision !== c.expectedRevision)
      throw new Error('Záznam zmenil iný používateľ. Obnovte denník.');
    const before = JSON.stringify({
      actualArrival: r.actualArrival,
      actualDeparture: r.actualDeparture,
      track: r.track,
      notes: r.notes,
      status: r.status,
    });
    const action = c.action || 'record';
    if (action === 'train') {
      const next = structuredClone(r);
      for (const event of ['arrival', 'departure'] as const) {
        if (!c[event]) continue;
        const field = event === 'arrival' ? 'actualArrival' : 'actualDeparture';
        const eventDate = c[event + 'Date'] || clock().date;
        if (next[field] === c[event] && next.eventDates[event] === eventDate) continue;
        if (next.lockedEvents?.[event]) throw new Error('Potvrdený čas už nemožno meniť.');
        Object.assign(
          next,
          movementPatch(next, event, eddTimeSchema.parse(c[event]), !!next[field]),
        );
        next.eventDates[event] = eventDate;
      }
      if (
        next.actualArrival &&
        next.actualDeparture &&
        next.eventDates.arrival! + 'T' + next.actualArrival >
          next.eventDates.departure! + 'T' + next.actualDeparture
      )
        throw new Error('Odchod je pred príchodom. Skontrolujte dátum a čas.');
      Object.assign(r, next, { dwell: c.dwell });
    } else if (['record', 'correct'].includes(action)) {
      if (action === 'record' && !canRecord(r, c.event))
        throw new Error('Úkon nezodpovedá stavu vlaku. Obnovte denník.');
      if (action === 'correct' && !c.reason) throw new Error('Uveďte dôvod opravy.');
      Object.assign(
        r,
        movementPatch(
          r,
          c.event,
          eddTimeSchema.parse(c.time || clock().minuteTime),
          action === 'correct',
        ),
      );
    } else if (action === 'details')
      Object.assign(r, { track: c.track, notes: c.notes, movement: c.movement });
    else {
      if (!c.reason) throw new Error('Uveďte dôvod zmeny.');
      r.status = action === 'cancel' ? 'cancelled' : 'scheduled';
    }
    r.history.push({
      at: new Date().toISOString(),
      operator: stationId === 'kolarovo' ? 'Novák' : 'Kováč',
      userId: stationId,
      action: action + (c.event ? ':' + c.event : ''),
      before,
      after: JSON.stringify({
        actualArrival: r.actualArrival,
        actualDeparture: r.actualDeparture,
        track: r.track,
        notes: r.notes,
        status: r.status,
      }),
      reason: c.reason || '',
      operatingDate: clock().date,
      operatingTime: clock().time,
    });
    r.revision++;
  } else if (c.command === 'send') {
    if (requests.has(c.requestId)) return { message: requests.get(c.requestId) } as T;
    if (c.kind === 'odhlaska' && !c.wholeTrainConfirmed)
      throw new Error('Potvrďte, že celý vlak uvoľnil oddiel a sú splnené podmienky odhlášky.');
    if (['wait', 'cancel', 'correction', 'note'].includes(c.kind) && !c.text)
      throw new Error('Doplňte text alebo dôvod správy.');
    const original = messages.find((m) => m.id === c.replyToId);
    if (c.kind === 'accept' && !original) throw new Error('Vyberte pôvodnú správu.');
    const forms = stationForms(stationId === 'kolarovo' ? 'Kolárovo' : 'Veselé');
    const m: EddMessage = {
      ...c,
      id: crypto.randomUUID(),
      fromStation: stationId,
      createdAt: new Date().toISOString(),
      date: clock().date,
      time: eddTimeSchema.parse(c.time || clock().minuteTime),
      operator: stationId === 'kolarovo' ? 'Novák' : 'Kováč',
      userId: stationId,
      ...forms,
      ...(c.kind === 'accept' && original
        ? {
            time: original.time,
            stationName: original.stationName,
            stationLocative: original.stationLocative,
            stationGenitive: original.stationGenitive,
          }
        : {}),
    };
    requests.set(c.requestId, m);
    messages.push(m);
    return { message: m } as T;
  } else if (c.command === 'receive') {
    const m = messages.find((m) => m.id === c.id && m.toStation === stationId)!;
    m.deliveredAt ||= new Date().toISOString();
    if (c.acknowledge) {
      m.acknowledgedAt ||= new Date().toISOString();
      m.acknowledgedBy = stationId === 'kolarovo' ? 'Novák' : 'Kováč';
    }
    if (c.acknowledge && ['arrival', 'departure'].includes(m.kind)) {
      const event = m.kind as 'arrival' | 'departure';
      const record = rows.find(
        (r) =>
          r.stationId === m.fromStation &&
          r.trainNumber === m.trainNumber &&
          (event === 'arrival' ? r.actualArrival : r.actualDeparture) === m.time &&
          r.eventDates[event] === m.date,
      );
      if (record) {
        record.lockedEvents = { ...record.lockedEvents, [event]: m.id };
        record.revision++;
      }
    }
    return { message: m } as T;
  }
  return {} as T;
}

export function advancePreviewClock() {
  offsetMinutes += 1;
}
