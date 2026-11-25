import assert from 'node:assert/strict';
import test from 'node:test';
import { kamenanskoTransportPoints, timetableTransportPoints } from '../transport-points';

test('Kameňansko includes all agreed points and preserves existing runtime IDs', () => {
  const points = timetableTransportPoints('113144512557419', [
    { stationId: 'existing-solinky', name: 'odb. Solinky' },
    { stationId: 'kolarovo', name: 'Kolárovo' },
  ]);
  assert.equal(points.length, 27);
  assert.equal(new Set(points.map((point) => point.stationId)).size, 27);
  assert.equal(
    points.find((point) => point.name === 'odb. Solinky')?.stationId,
    'existing-solinky',
  );
  for (const name of ['Milošov', 'Milošov z', 'Lubina', 'Dvorníky zastávka z'])
    assert.ok(points.some((point) => point.name === name));
  assert.ok(!kamenanskoTransportPoints.some((point) => point.name.endsWith('z.')));
});

test('other maps retain their own catalogue and stop suffixes have no dot', () => {
  assert.deepEqual(
    timetableTransportPoints('another-map', [{ stationId: 'custom', name: 'Lúka z.' }]),
    [{ stationId: 'custom', name: 'Lúka z' }],
  );
});
