import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calendarsOverlap, newPlanning, operatesOn } from '../gvd-planning';
import { applyMeasuredRoute, dailyTimetable } from '../gvd-simple';
import { validateGvdPlan } from '../gvd-validation';
import { railwayLineSchema, type RailwayLine } from '../lines';
import { normalizeTimetable, type TimetableInput } from '../timetable';
const train: TimetableInput = {
  trainNumber: '90001',
  trainType: 'Os',
  maxSpeed: 100,
  trainLength: 100,
  stops: [
    { station: 'A', arrival: '23:50', departure: '23:50', track: '1' },
    { station: 'B', arrival: '00:03', departure: '00:05', track: '2' },
    { station: 'C', arrival: '00:17', departure: '00:17', track: '1' },
  ],
};
const line: RailwayLine = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  placeId: '123',
  name: 'Measured A–C',
  stations: ['A', 'B', 'C'],
  measuredStops: train.stops,
};
test('measured templates preserve journey and dwell times when shifted across midnight', () => {
  const result = normalizeTimetable(applyMeasuredRoute(train, line, '08:00'));
  assert.deepEqual(
    result.stops.map((s) => [s.arrival, s.departure]),
    [
      ['08:00', '08:00'],
      ['08:13', '08:15'],
      ['08:27', '08:27'],
    ],
  );
  assert.equal(result.trainNumber, train.trainNumber);
  assert.equal(result.planning?.daily, true);
  assert.equal(result.planning?.lineId, line.id);
  assert.deepEqual(line.measuredStops, train.stops);
});
test('unmeasured routes do not invent travel times and invalid start clocks are rejected', () => {
  const result = applyMeasuredRoute(train, { ...line, measuredStops: undefined }, '10:00');
  assert.ok(result.stops.every((s) => s.arrival === '10:00' && s.departure === '10:00'));
  assert.throws(() => applyMeasuredRoute(train, line, '25:00'));
});
test('route templates reject mismatched station order and multiple-day mistakes', () => {
  assert.equal(railwayLineSchema.safeParse(line).success, true);
  assert.equal(railwayLineSchema.safeParse({ ...line, stations: ['B', 'A', 'C'] }).success, false);
  assert.equal(
    railwayLineSchema.safeParse({
      ...line,
      measuredStops: [
        { ...train.stops[0], arrival: '08:00', departure: '08:00' },
        { ...train.stops[1], arrival: '07:00', departure: '07:00' },
        { ...train.stops[2], arrival: '06:00', departure: '06:00' },
      ],
    }).success,
    false,
  );
});
test('daily manual trains ignore historical calendars while retirement remains respected', () => {
  const result = dailyTimetable({ ...train, planning: { ...newPlanning(), mode: 'estimated' } });
  assert.equal(result.planning?.mode, 'manual');
  assert.equal(operatesOn(result.planning, '2026-11-25'), true);
  assert.equal(calendarsOverlap(result.planning, result.planning), true);
  assert.equal(operatesOn({ ...result.planning!, status: 'retired' }, '2026-11-25'), false);
  assert.equal(
    calendarsOverlap(result.planning, { ...result.planning!, status: 'retired' }),
    false,
  );
});
test('simple plans retain conflict checks without requiring technical profiles', () => {
  const result = dailyTimetable(train);
  assert.deepEqual(validateGvdPlan(result, [], []), { conflicts: [], warnings: [] });
  const report = validateGvdPlan(result, [{ ...result, trainNumber: '90002', $id: 'peer' }], []);
  assert.ok(report.conflicts.length > 0);
  assert.ok(!report.warnings.some((w) => /profil|brzdiacich/.test(w.message)));
});
