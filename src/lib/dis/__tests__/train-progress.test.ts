import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { EddEntry } from '../edd';
import type { Timetable } from '../timetable';
import { readTpvLayouts, reorderTpvStations } from '../tpv-layout';
import {
  graphTrainStops,
  isFreightTrain,
  lastReportedStop,
  recordedTrainSegments,
  trainCancellation,
  trainOverviewPoints,
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

test('clock alone draws no solid path; a reported departure advances only its next leg', () => {
  assert.deepEqual(recordedTrainSegments(train, [], 600), []);
  assert.deepEqual(recordedTrainSegments(train, [report('a', { actualDeparture: '08:06' })], 491), [
    [
      { station: 'a', minute: 486 },
      { station: 'a', toward: 'b', minute: 491, fraction: 0.5 },
    ],
  ]);
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
  assert.deepEqual(segments[0], [
    { station: 'c', minute: 500 },
    { station: 'c', minute: 506 },
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

test('normalized endpoints and early departure never shift the graph by a day', () => {
  const normalized = {
    ...train,
    stops: train.stops.map((s, i) => ({
      ...s,
      arrival: i === 0 ? s.departure : s.arrival,
      departure: i === 3 ? s.arrival : s.departure,
    })),
  };
  const points = graphTrainStops(normalized, [report('a', { actualDeparture: '07:54' })], 480);
  assert.equal(points[0].arrivalMinute, 474);
  assert.equal(points[0].departureMinute, 474);
  assert(points.every((p) => p.departureMinute < 1440));
});
test('early terminus arrival has no artificial destination layover', () => {
  const terminal = { ...train, stops: [train.stops[0], { ...train.stops[3], departure: '08:35' }] };
  const points = graphTrainStops(terminal, [report('d', { actualArrival: '08:29' })], 600);
  assert.equal(points[1].arrivalMinute, 509);
  assert.equal(points[1].departureMinute, 509);
});
test('a real midnight trip retains numerical next-day coordinates', () => {
  const night = {
    ...train,
    stops: [
      { ...train.stops[0], arrival: '23:55', departure: '23:55' },
      { ...train.stops[3], arrival: '00:05', departure: '00:05' },
    ],
  };
  const points = graphTrainStops(night, [report('a', { actualDeparture: '23:50' })]);
  assert.equal(points[0].departureMinute, 1430);
  assert.equal(points[1].arrivalMinute, 1440);
});
test('origin layover is solid from its persisted start until now', () => {
  const points = recordedTrainSegments(
    train,
    [report('a', { dwell: true, dwellStartedTime: '07:59' })],
    485,
  );
  assert.deepEqual(points, [
    [
      { station: 'a', minute: 479 },
      { station: 'a', minute: 485 },
    ],
  ]);
});
test('confirmed travel bridges ordinary halts without fabricating their records', () => {
  const local = {
    ...train,
    stops: [
      { ...train.stops[0], station: 'kolarovo' },
      { ...train.stops[1], station: 'stefanovo' },
      { ...train.stops[3], station: 'vesele' },
    ],
  };
  const records = [
    report('kolarovo', { actualDeparture: '08:00' }),
    report('vesele', { actualArrival: '08:35' }),
  ];
  const points = recordedTrainSegments(local, records);
  assert.equal(points.length, 1);
  assert.equal(points[0][1].station, 'stefanovo');
  assert.equal(trainProgress(local, records)[1].arrivalRecorded, false);
});
test('overview expands explicit topology but assigns no invented times to inserted points', () => {
  const network = {
    points: [],
    sections: [
      { id: 'ab', from: 'a', to: 'halt', tracks: 1, block: 'unknown', against: false },
      { id: 'bc', from: 'halt', to: 'd', tracks: 1, block: 'unknown', against: false },
    ],
  } as import('../railway-network').RailwayNetwork;
  assert.deepEqual(
    trainOverviewPoints({ ...train, stops: [train.stops[0], train.stops[3]] }, network),
    [{ station: 'a', index: 0 }, { station: 'halt' }, { station: 'd', index: 1 }],
  );
});
test('cancellation is scoped to its timetable and does not erase historical actuals', () => {
  const record = report('a', {
    actualDeparture: '08:00',
    cancellation: { fromStation: 'c', reason: 'QA' },
  });
  assert.equal(trainCancellation(train, [record])?.fromStation, 'c');
  assert.equal(trainCancellation({ ...train, $id: 'other' }, [record]), undefined);
  assert.equal(trainProgress(train, [record])[0].departureRecorded, true);
});
