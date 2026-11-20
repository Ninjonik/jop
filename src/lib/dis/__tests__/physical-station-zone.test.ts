import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionDocumentSchema, type PhysicalOccupation } from '../../station/domain';
import {
  physicalVehicleContacts,
  physicalVehicleRadioZone,
  physicalVehicleStation,
  projectPhysicalTrainLabels,
} from '../../station/physical-trains';

const sensorId = '00000000-0000-4000-8000-000000000001';
const otherSensorId = '00000000-0000-4000-8000-000000000002';

function session(
  ...sections: { station: string; distance: number | null; occupied?: boolean; sensorId?: string }[]
) {
  const occupations: Record<string, PhysicalOccupation> = Object.fromEntries(
    sections.map((section, index) => [
      String(index),
      {
        stationId: section.station,
        pieceId: String(index),
        traversalState: 'occupied',
        occupied: section.occupied ?? true,
        eventId: String(index),
        observedAt: '2026-11-20T12:00:00Z',
        vehicles: [{ sensorId: section.sensorId ?? sensorId, distanceToFront: section.distance }],
      },
    ]),
  );
  return sessionDocumentSchema.parse({
    _id: 'zones',
    status: 'active',
    mockMode: true,
    createdAt: '2026-11-20T12:00:00Z',
    updatedAt: '2026-11-20T12:00:00Z',
    interpreter: { kind: 'mock' },
    topology: { lineblockLinks: {} },
    runtime: { trains: {}, lineblocks: {}, physicalOccupations: occupations },
  });
}
const zones = new Map([
  ['a', 'A1'],
  ['b', 'B1'],
  ['inter', '00'],
]);

test('inter never overrides a normal station, even with a further-ahead contact or missing travel direction', () => {
  for (const distance of [-1000, 1000, null]) {
    const current = session({ station: 'inter', distance }, { station: 'a', distance: null });
    assert.equal(physicalVehicleStation(current, sensorId), 'a');
    assert.equal(physicalVehicleRadioZone(current, sensorId, zones), 'A1');
    assert.equal(
      physicalVehicleContacts(current, sensorId).length,
      2,
      'Physical occupancy itself remains intact',
    );
  }
});
test('two overlapping normal stations resolve toward travel and reverse independently of station names/report order', () => {
  const forward = session(
    { station: 'a', distance: 8 },
    { station: 'inter', distance: -1000 },
    { station: 'b', distance: -8 },
  );
  assert.equal(physicalVehicleStation(forward, sensorId), 'b');
  assert.equal(physicalVehicleRadioZone(forward, sensorId, zones), 'B1');
  const reverse = session(
    { station: 'b', distance: 8 },
    { station: 'a', distance: -8 },
    { station: 'inter', distance: -1000 },
  );
  assert.equal(physicalVehicleStation(reverse, sensorId), 'a');
  assert.equal(physicalVehicleRadioZone(reverse, sensorId, zones), 'A1');
});
test('inter alone has no station/dispatcher; 00 remains the outside-station display', () => {
  const current = session({ station: 'inter', distance: -100 });
  assert.equal(physicalVehicleStation(current, sensorId), null);
  assert.equal(physicalVehicleRadioZone(current, sensorId, zones), '00');
  assert.equal(physicalVehicleRadioZone(session(), sensorId, zones), '--');
});
test('directionless, incompletely measured, or exactly tied normal-station overlaps are explicitly unknown', () => {
  for (const distances of [
    [null, null],
    [null, -5],
    [-5, null],
    [-5, -5],
    [-5, -5.00000001],
  ]) {
    const current = session(
      { station: 'a', distance: distances[0] },
      { station: 'b', distance: distances[1] },
      { station: 'inter', distance: -1000 },
    );
    assert.equal(physicalVehicleStation(current, sensorId), null);
    assert.equal(physicalVehicleRadioZone(current, sensorId, zones), '--');
  }
});
test('one measured section per candidate is sufficient; cleared sections and other vehicles cannot select a station', () => {
  const current = session(
    { station: 'a', distance: null },
    { station: 'a', distance: 5 },
    { station: 'b', distance: -5 },
    { station: 'c', distance: -100, occupied: false },
    { station: 'd', distance: -200, sensorId: otherSensorId },
  );
  assert.equal(physicalVehicleStation(current, sensorId), 'b');
});

test('an inter occupation cannot steal the public station train label', () => {
  const current = session({ station: 'inter', distance: -1000 }, { station: 'a', distance: 0 });
  const labels = projectPhysicalTrainLabels(
    current,
    [
      {
        _id: 'radio',
        sessionId: 'zones',
        sensorId: sensorId,
        revision: 1,
        updatedAt: '2026-11-20T12:00:00Z',
        binding: {
          userId: 'driver',
          driverId: '123',
          timetableId: null,
          trainType: 'Os',
          trainNumber: '5001',
          functionCode: '01',
        },
      },
    ],
    { inter: { '0': 'track' }, a: { '1': 'track' } },
  );
  assert.equal(labels.a['1'].text, 'Os 5001');
  assert.equal(labels.inter, undefined);
});
