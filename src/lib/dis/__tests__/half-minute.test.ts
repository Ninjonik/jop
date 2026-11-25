import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clockMinutes,
  clockSchema,
  formatDwell,
  formatMinute,
  normalizeTimetable,
  shiftTimetable,
} from '../timetable';

test('half-minute dwell survives normalization, shifting and midnight', () => {
  assert.equal(clockMinutes('08:30'), 510);
  assert.equal(clockMinutes('08:30:30'), 510.5);
  assert.equal(formatMinute(1440.5), '00:00:30');
  for (const minutes of [0, 1, 12, 120]) assert.equal(formatDwell(minutes + 0.5), `${minutes}⁵`);
  assert.equal(clockSchema.safeParse('08:00:45').success, false);
  const train = normalizeTimetable({
    trainNumber: '1',
    trainType: 'Os',
    maxSpeed: 100,
    trainLength: 100,
    stops: [
      { station: 'A', arrival: '23:58', departure: '23:58' },
      { station: 'B', arrival: '23:59:30', departure: '00:00' },
      { station: 'C', arrival: '00:05:30', departure: '00:05:30' },
    ],
  });
  assert.equal(train.stops[1].dwell, 0.5);
  assert.equal(shiftTimetable(train, 10).stops[1].arrival, '00:09:30');
});
