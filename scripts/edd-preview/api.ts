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
      delayMinutes: 0,
      revision: 0,
      notes: '',
      history: [],
      eventDates: {},
    });
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
function clock() {
  return {
    sessionId,
    offsetMinutes: 0,
    configured: false,
    serverUnixMs: Date.now(),
    ...operatingClockParts(),
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
    if (['record', 'correct'].includes(action)) {
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
    return { message: m } as T;
  }
  return {} as T;
}
