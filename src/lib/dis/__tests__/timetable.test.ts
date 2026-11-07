import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alignClockMinute,
  checkTimetableConflicts,
  normalizeTimetable,
  unfoldStops,
  type TimetableInput,
} from '../timetable';

const timetable = (stops: TimetableInput['stops']): TimetableInput => ({
  trainNumber: 'Os 1',
  trainType: 'Os',
  maxSpeed: 120,
  trainLength: 250,
  stops,
});
const stop = (station: string, arrival: string, departure: string, track = '1') => ({
  station,
  arrival,
  departure,
  track,
});

test('passenger, freight and operational category codes survive timetable normalization', () => {
  for (const trainType of [
    'EC',
    'EN',
    'IC',
    'Ex',
    'RR',
    'REX',
    'Zr',
    'rj',
    'RJ',
    'Nex',
    'Zn',
    'Vn',
    'Pv',
    'Vleč',
    'Sv',
    'Rv',
    'P',
  ] as const) {
    const input = normalizeTimetable({
      ...timetable([stop('A', '12:00', '12:01'), stop('B', '12:20', '12:21')]),
      trainType,
    });
    assert.equal(input.trainType, trainType);
  }
});

test('unsupported category codes are rejected at the timetable boundary', () => {
  const input = timetable([stop('A', '12:00', '12:01'), stop('B', '12:20', '12:21')]);
  assert.throws(() => normalizeTimetable({ ...input, trainType: 'unknown' }));
});
test('midnight rollover preserves ordered arrivals, departures and dwell', () => {
  const input = normalizeTimetable(
    timetable([stop('A', '23:55', '00:05'), stop('B', '00:20', '00:22')]),
  );
  const timeline = unfoldStops(input.stops);
  assert.deepEqual(
    timeline.map((item) => [item.arrivalMinute, item.departureMinute]),
    [
      [1435, 1445],
      [1460, 1462],
    ],
  );
  assert.equal(input.stops[0].dwell, 10);
});
test('same track conflicts with the next daily service across midnight', () => {
  const first = timetable([stop('A', '23:55', '00:05'), stop('B', '00:20', '00:21')]);
  const second = timetable([stop('a', '00:01', '00:04'), stop('C', '00:30', '00:31')]);
  assert.equal(checkTimetableConflicts(first, [second]).conflicts.length, 1);
});
test('different tracks and touching half-open dwell intervals do not conflict', () => {
  const first = timetable([stop('A', '10:00', '10:05'), stop('B', '10:20', '10:21')]);
  const otherTrack = timetable([stop('A', '10:01', '10:04', '2'), stop('C', '10:30', '10:31')]);
  const following = timetable([stop('A', '10:05', '10:06'), stop('C', '10:30', '10:31')]);
  assert.equal(checkTimetableConflicts(first, [otherTrack, following]).conflicts.length, 0);
});
test('instantaneous stops occupy one minute', () => {
  const first = timetable([stop('A', '10:00', '10:00'), stop('B', '10:20', '10:21')]);
  assert.equal(checkTimetableConflicts(first, [first]).conflicts.length, 2);
});
test('opposite direction overlap is a capacity warning, not an invented single-track conflict', () => {
  const first = timetable([stop('A', '10:00', '10:01'), stop('B', '10:20', '10:21')]);
  const second = timetable([stop('B', '10:02', '10:03', '2'), stop('A', '10:18', '10:19', '2')]);
  const report = checkTimetableConflicts(first, [second]);
  assert.equal(report.conflicts.length, 0);
  assert.equal(report.warnings.length, 1);
});
test('invalid clocks and journeys spanning multiple daily cycles are rejected', () => {
  assert.throws(() =>
    normalizeTimetable(timetable([stop('A', '25:00', '10:00'), stop('B', '11:00', '11:01')])),
  );
  assert.throws(() =>
    normalizeTimetable(timetable([stop('A', '10:00', '11:00'), stop('B', '09:00', '08:00')])),
  );
});

test('reported clocks are aligned to the nearest service day', () => {
  assert.equal(alignClockMinute('00:05', 1435), 1445);
  assert.equal(alignClockMinute('23:58', 1445), 1438);
  assert.equal(alignClockMinute('12:00', 720), 720);
});
