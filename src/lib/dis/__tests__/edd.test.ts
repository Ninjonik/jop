import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  canRecord,
  eddTimeSchema,
  formatEddMessage,
  inferMovement,
  messageKinds,
  movementPatch,
  offsetEddTime,
  stationForms,
  type EddEntry,
  type EddMessage,
} from '../edd';
import { clockMinutes } from '../timetable';
const entry: EddEntry = {
  $id: 'run',
  sessionId: 'session',
  stationId: 'kolarovo',
  trainNumber: '5849',
  trainType: 'Os',
  direction: '',
  schedArrival: '23:58',
  schedDeparture: '00:01',
  actualArrival: '',
  actualDeparture: '',
  track: '1',
  delayMinutes: 0,
  status: 'scheduled',
  revision: 0,
  movement: 'stop',
  notes: '',
  history: [],
  eventDates: {},
};
const message: EddMessage = {
  id: 'message',
  sessionId: 'session',
  fromStation: 'vesele',
  toStation: 'kolarovo',
  trainNumber: '5849',
  kind: 'offer',
  time: '14:55',
  date: '2005-06-01',
  createdAt: '',
  operator: 'Novák',
  userId: 'user',
  ...stationForms('Veselé'),
  text: '',
};
test('origin and terminus do not require fictional endpoint events', () => {
  assert(canRecord({ ...entry, movement: 'origin' }, 'departure'));
  assert(!canRecord({ ...entry, movement: 'origin' }, 'arrival'));
  assert(canRecord({ ...entry, movement: 'terminus' }, 'arrival'));
  assert(!canRecord({ ...entry, movement: 'terminus' }, 'departure'));
});
test('stopping and passing trains support separate movements and legacy passage', () => {
  assert(!canRecord(entry, 'departure'));
  assert(canRecord({ ...entry, actualArrival: '23:59', status: 'arrived' }, 'departure'));
  assert(canRecord({ ...entry, movement: 'pass' }, 'passage'));
  assert(canRecord({ ...entry, movement: 'pass' }, 'arrival'));
  const passed = { ...entry, ...movementPatch({ ...entry, movement: 'pass' }, 'passage', '00:02') };
  assert.equal(passed.status, 'passed');
  assert.equal(passed.actualDeparture, '00:02');
  assert(!canRecord(passed, 'passage'));
});
test('delay handles midnight and actual seconds without changing GVD', () => {
  assert.equal(movementPatch(entry, 'arrival', '00:00:30').delayMinutes, 3);
  assert.equal(movementPatch(entry, 'arrival', '23:57:15').delayMinutes, 0);
  assert.throws(() => movementPatch(entry, 'departure', '00:03'));
  assert.equal(entry.actualArrival, '');
});
test('diary entry accepts compact minutes and rejects seconds', () => {
  for (const [input, expected] of [
    ['1803', '18:03'],
    ['803', '08:03'],
    ['18.03', '18:03'],
  ])
    assert.equal(eddTimeSchema.parse(input), expected);
  for (const input of ['24:00', '18:60', '18:03:00', '18:03:47', '18:03:99', 'hello'])
    assert(!eddTimeSchema.safeParse(input).success);
});
test('timetable endpoints and passage are explicitly classified', () => {
  assert.equal(inferMovement({}, 0, 4), 'origin');
  assert.equal(inferMovement({}, 3, 4), 'terminus');
  assert.equal(inferMovement({ kind: 'pass' }, 2, 4), 'pass');
  assert.equal(inferMovement({}, 1, 4), 'stop');
});
test('prescribed offer and odhlaska preserve train/place/operator in both languages', () => {
  assert.equal(
    formatEddMessage(message, 'sk'),
    'Prijmete vlak 5849 s odchodom z Veselého o 14:55? Novák.',
  );
  assert.equal(
    formatEddMessage(message, 'en'),
    'Will you accept train 5849 departing Veselé at 14:55? Novák.',
  );
  const arrived = {
    ...message,
    ...stationForms('Kolárovo'),
    kind: 'odhlaska' as const,
    acknowledgedBy: 'Kováč',
  };
  assert.equal(formatEddMessage(arrived, 'sk', true), 'Vlak 5849 v Kolárove, rozumel Kováč.');
  assert.equal(formatEddMessage(arrived, 'en', true), 'Train 5849 at Kolárovo, understood. Kováč.');
  for (const kind of messageKinds)
    for (const locale of ['sk', 'en'] as const)
      assert(!formatEddMessage({ ...message, kind }, locale).includes('undefined'));
});
test('unknown place forms are explicit rather than automatically guessed', () => {
  assert(!stationForms('New station').known);
  assert.equal(stationForms('Kolárovo').stationLocative, 'Kolárove');
});
test('existing train graph retains second-precision EDD reports', () => {
  assert.equal(clockMinutes('18:03:45'), 1083.75);
  assert.equal(clockMinutes('18:03:30'), 1083.5);
});
test('EDD API rejects unauthenticated diary reads and all writes', async () => {
  const { GET, POST } = await import('../../../../apps/api/src/app/api/dis/edd/route');
  assert.equal(
    (await GET(new Request('http://localhost/api/dis/edd?sessionId=x&stationId=y'))).status,
    401,
  );
  for (const command of ['create', 'import', 'record', 'edit', 'send', 'receive']) {
    assert.equal(
      (
        await POST(
          new Request('http://localhost/api/dis/edd', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ command }),
          }),
        )
      ).status,
      401,
    );
  }
});

test('manual minute offsets retain the correct date and never add seconds', () => {
  assert.deepEqual(offsetEddTime('15:34', '2005-06-01', 4), { time: '15:38', date: '2005-06-01' });
  assert.deepEqual(offsetEddTime('23:58', '2005-06-01', 4), { time: '00:02', date: '2005-06-02' });
  assert.deepEqual(offsetEddTime('00:02', '2005-06-01', -4), { time: '23:58', date: '2005-05-31' });
  assert.deepEqual(offsetEddTime('15:34:30', '2005-06-01', 0), {
    time: '15:34',
    date: '2005-06-01',
  });
  for (const offset of [NaN, Infinity, 1.5, 1441, -1441])
    assert.throws(() => offsetEddTime('15:34', '2005-06-01', offset));
});
