import { Account, Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GET, POST } from '../../../../apps/api/src/app/api/dis/session-clock/route';
import { currentBratislavaTime, operatingClockParts } from '../clock';
import { changeStopTime, normalizeTimetable, type TimetableInput } from '../timetable';

test('18:00 real time becomes 06:00 with a twelve-hour offset in winter and summer', () => {
  for (const date of ['2026-11-25T17:00:00Z', '2026-07-01T16:00:00Z']) {
    assert.equal(currentBratislavaTime(0, Date.parse(date)), '18:00');
    assert.equal(currentBratislavaTime(-720, Date.parse(date)), '06:00');
  }
});
test('operating clock retains seconds, rolls dates and applies civil offsets across DST', () => {
  const result = operatingClockParts(-120, Date.parse('2025-12-31T23:30:45Z'));
  assert.equal(result.date, '2025-12-31');
  assert.equal(result.time, '22:30:45');
  assert.equal(result.secondOfDay, 22 * 3600 + 30 * 60 + 45);
  assert.equal(operatingClockParts(-120, Date.parse('2026-03-29T01:15:00Z')).time, '01:15:00');
});
const train: TimetableInput = {
  trainNumber: '90001',
  trainType: 'Os',
  trainLength: 100,
  maxSpeed: 100,
  stops: [
    { station: 'A', arrival: '23:50', departure: '23:50', track: '1' },
    { station: 'B', arrival: '00:05', departure: '00:06', track: '1' },
    { station: 'C', arrival: '00:20', departure: '00:20', track: '1' },
  ],
};
test('origin arrival and terminus departure may be absent or blank, including midnight', () => {
  const first = { station: 'A', departure: '23:50', track: '1' };
  const last = { station: 'C', arrival: '00:20', track: '1' };
  const result = normalizeTimetable({ ...train, stops: [first, train.stops[1], last] });
  assert.equal(result.stops[0].arrival, '23:50');
  assert.equal(
    normalizeTimetable({ ...train, stops: [{ ...first, departure: '2350' }, train.stops[1], last] })
      .stops[0].arrival,
    '23:50',
  );
  assert.equal(result.stops[2].departure, '00:20');
  assert.equal(
    normalizeTimetable({
      ...train,
      stops: [{ ...first, arrival: '' }, train.stops[1], { ...last, departure: '' }],
    }).stops[2].departure,
    '00:20',
  );
  assert.throws(() =>
    normalizeTimetable({ ...train, stops: [first, { ...train.stops[1], arrival: '' }, last] }),
  );
  assert.throws(() => normalizeTimetable({ ...train, stops: [{ station: 'A' }, last] }));
});
test('editing the visible endpoint event updates its implicit counterpart', () => {
  const start = changeStopTime(train, 0, 'departure', '22:00');
  assert.equal(start.stops[0].arrival, '22:00');
  const end = changeStopTime(start, 2, 'arrival', '00:30');
  assert.equal(end.stops[2].departure, '00:30');
});
test('clock requests require authentication and ordinary drivers cannot change shared time', async (context) => {
  for (const handler of [GET, POST])
    assert.equal(
      (await handler(new Request('http://localhost/api/dis/session-clock?sessionId=test'))).status,
      401,
    );
  const previous = process.env.APPWRITE_API_KEY;
  process.env.APPWRITE_API_KEY = 'synthetic-test-key';
  context.after(() => {
    if (previous === undefined) delete process.env.APPWRITE_API_KEY;
    else process.env.APPWRITE_API_KEY = previous;
  });
  context.mock.method(Account.prototype, 'get', async () => ({ $id: 'test-user' }));
  context.mock.method(Databases.prototype, 'getDocument', async () => ({
    userId: 'test-user',
    role: 'driver',
  }));
  const response = await POST(
    new Request('http://localhost/api/dis/session-clock', {
      method: 'POST',
      headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'test', offsetMinutes: -720 }),
    }),
  );
  assert.equal(response.status, 403);
});
