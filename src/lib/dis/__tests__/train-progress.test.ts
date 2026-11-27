import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EddEntry } from '../edd';
import type { Timetable } from '../timetable';
import { readTpvLayouts, reorderTpvStations } from '../tpv-layout';
import {
  isFreightTrain,
  lastReportedStop,
  recordedTrainSegments,
  trainProgress,
} from '../train-progress';
const train: Timetable = {
  $id: 't1',
  trainNumber: '3150',
  trainType: 'Os',
  maxSpeed: 100,
  trainLength: 100,
  stops: [
    { station: 'a', arrival: '', departure: '08:00', track: '' },
    { station: 'b', arrival: '08:10', departure: '08:12', track: '', kind: 'pass' },
    { station: 'c', arrival: '08:22', departure: '08:25', track: '', kind: 'stop' },
    { station: 'd', arrival: '08:35', departure: '', track: '' },
  ],
};
function report(station: string, values: Partial<EddEntry>): EddEntry {
  return {
    $id: station,
    sessionId: 's',
    stationId: station,
    trainNumber: '3150',
    trainType: 'Os',
    direction: '',
    schedArrival: '',
    schedDeparture: '',
    actualArrival: '',
    actualDeparture: '',
    track: '',
    status: 'scheduled',
    delayMinutes: 0,
    revision: 1,
    movement: 'stop',
    notes: '',
    history: [],
    eventDates: {},
    timetableId: 't1',
    ...values,
  };
}
test('six-minute departure delay propagates through future stations', () => {
  const result = trainProgress(train, [report('a', { actualDeparture: '08:06' })]);
  assert.equal(result[1].arrival, 8 * 60 + 16);
  assert.equal(result[3].arrival, 8 * 60 + 41);
  assert.equal(result[1].arrivalRecorded, false);
  assert.equal(lastReportedStop(result)?.station, 'a');
});
test('early passing train keeps its advance; stopping departure waits for booked time', () => {
  const result = trainProgress(train, [report('a', { actualDeparture: '07:54' })]);
  assert.equal(result[1].departure, 8 * 60 + 6);
  assert.equal(result[2].arrival, 8 * 60 + 16);
  assert.equal(result[2].departure, 8 * 60 + 25);
  assert.equal(result[3].arrival, 8 * 60 + 35);
});
test('layover advances departure and downstream estimates without fabricating actuals', () => {
  const records = [report('b', { actualArrival: '08:10', dwell: true })];
  const result = trainProgress(train, records, 8 * 60 + 20);
  assert.equal(result[1].departure, 8 * 60 + 20);
  assert.equal(result[2].arrival, 8 * 60 + 30);
  assert.equal(result[1].departureRecorded, false);
  assert.equal(records[0].actualDeparture, '');
});
test('manual departure takes precedence over a stale layover flag', () => {
  const result = trainProgress(
    train,
    [report('b', { actualArrival: '08:10', actualDeparture: '08:15', dwell: true })],
    8 * 60 + 50,
  );
  assert.equal(result[1].departure, 8 * 60 + 15);
  assert.equal(result[1].dwell, false);
});
test('another timetable with the same train number cannot affect estimates', () => {
  const result = trainProgress(train, [
    report('a', { timetableId: 'other', actualDeparture: '09:00' }),
  ]);
  assert.equal(result[1].arrival, 8 * 60 + 10);
});
test('midnight alignment keeps following-day times ordered', () => {
  const night = {
    ...train,
    stops: [
      { station: 'a', arrival: '', departure: '23:55', track: '' },
      { station: 'b', arrival: '00:05', departure: '', track: '' },
    ],
  };
  const result = trainProgress(night, [report('a', { actualDeparture: '00:01' })]);
  assert.equal(result[1].arrival, 1451);
});
test('future actual departure remains authoritative and acknowledgements remain separate', () => {
  const result = trainProgress(train, [
    report('b', {
      actualArrival: '08:16',
      actualDeparture: '08:18',
      lockedEvents: { arrival: 'msg' },
    }),
  ]);
  assert(result[1].arrivalAcknowledged);
  assert(!result[1].departureAcknowledged);
  assert.equal(result[2].arrival, 8 * 60 + 28);
});
test('empty or malformed layout data is safe and multiple named layouts load', () => {
  assert.deepEqual(readTpvLayouts('bad'), []);
  assert.deepEqual(readTpvLayouts('[{}]'), []);
  const items = [
    { id: 'a', name: 'A', lineId: '', first: 'a', last: 'b', hidden: ['c'] },
    { id: 'b', name: 'B', lineId: 'x', first: '', last: '', hidden: [] },
  ];
  assert.deepEqual(
    readTpvLayouts(JSON.stringify(items)),
    items.map((item) => ({ ...item, order: [] })),
  );
});
test('freight and passenger categories use distinct graph styles', () => {
  for (const category of ['Mn', 'Nex', 'Pn', 'Vleč']) assert(isFreightTrain(category));
  for (const category of ['Os', 'R', 'EC', 'REX']) assert(!isFreightTrain(category));
});

test('elapsed clock never turns unreported travel into solid actuals', () => {
  assert.deepEqual(recordedTrainSegments(train, [], 600), []);
  assert.deepEqual(
    recordedTrainSegments(train, [report('a', { actualDeparture: '08:06' })], 600),
    [],
  );
});
test('solid travel requires departure and the next arrival, with no bridge across missing reports', () => {
  const records = [
    report('a', { actualDeparture: '08:06' }),
    report('b', { actualArrival: '08:16' }),
    report('d', { actualArrival: '08:40' }),
  ];
  assert.deepEqual(recordedTrainSegments(train, records, 600), [
    [
      { station: 'a', minute: 486 },
      { station: 'b', minute: 496 },
    ],
  ]);
});
test('active layover is horizontal from recorded arrival to now, not future departure', () => {
  const segments = recordedTrainSegments(
    train,
    [report('c', { actualArrival: '08:20', dwell: true })],
    8 * 60 + 23,
  );
  assert.deepEqual(segments, [
    [
      { station: 'c', minute: 500 },
      { station: 'c', minute: 503 },
    ],
  ]);
});
test('completed layover uses its recorded departure and stops following clock', () => {
  const segments = recordedTrainSegments(
    train,
    [report('c', { actualArrival: '08:20', actualDeparture: '08:26', dwell: true })],
    600,
  );
  assert.deepEqual(segments, [
    [
      { station: 'c', minute: 500 },
      { station: 'c', minute: 506 },
    ],
  ]);
});
test('layout station order moves both ways and survives saved preferences', () => {
  assert.deepEqual(reorderTpvStations(['a', 'b', 'c'], 'c', 'a'), ['c', 'a', 'b']);
  assert.deepEqual(reorderTpvStations(['a', 'b', 'c'], 'a', 'b'), ['b', 'a', 'c']);
  const layout = {
    id: 'test',
    name: 'Section',
    lineId: '',
    first: '',
    last: '',
    hidden: [],
    order: ['c', 'a', 'b'],
  };
  assert.deepEqual(readTpvLayouts(JSON.stringify([layout]))[0].order, ['c', 'a', 'b']);
});
