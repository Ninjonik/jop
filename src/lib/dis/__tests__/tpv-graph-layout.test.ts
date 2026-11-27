import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followTimeScroll, placeTrainNumber } from '../tpv-graph-layout';
test('train number moves along its path away from a crossing line', () => {
  const start = { x: 0, y: 0 },
    end = { x: 200, y: 100 };
  const clear = placeTrainNumber(start, end, [], 50);
  const avoided = placeTrainNumber(
    start,
    end,
    [{ from: { x: 72, y: -100 }, to: { x: 72, y: 150 } }],
    50,
  );
  assert(avoided.x > clear.x + 30);
  assert.equal(avoided.y, avoided.x / 2);
  assert(avoided.x < end.x);
});
test('short and reverse running segments produce finite upright labels', () => {
  for (const [from, to] of [
    [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
    [
      { x: 100, y: 0 },
      { x: 0, y: 200 },
    ],
  ]) {
    const label = placeTrainNumber(from, to, [], 70);
    assert(Number.isFinite(label.x) && Number.isFinite(label.y));
    assert(Math.abs(label.angle) <= 90);
  }
});
test('following keeps forecast space and clamps at the beginning of the graph', () => {
  const left = followTimeScroll(1500, 1000);
  const relative = 1500 - left;
  assert(relative > 180 + (1000 - 180) * 0.3);
  assert(relative < 180 + (1000 - 180) * 0.4);
  assert.equal(followTimeScroll(100, 1000), 0);
});
