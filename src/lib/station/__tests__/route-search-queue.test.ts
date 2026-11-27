import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RouteSearchQueue } from '../route-search-queue';

test('route queue matches stable cost sorting with interleaved candidates', () => {
  const queue = new RouteSearchQueue<{ cost: number; id: number }>();
  const reference: { cost: number; id: number }[] = [];
  let seed = 42;
  for (let id = 0; id < 2000; id++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const candidate = { cost: seed % 17, id };
    queue.push(candidate);
    reference.push(candidate);
    if (id % 3 === 0) {
      reference.sort((a, b) => a.cost - b.cost);
      assert.deepEqual(queue.shift(), reference.shift());
    }
  }
  reference.sort((a, b) => a.cost - b.cost);
  while (reference.length) assert.deepEqual(queue.shift(), reference.shift());
  assert.equal(queue.length, 0);
  assert.equal(queue.shift(), undefined);
  queue.push({ cost: 0, id: 2001 });
  assert.deepEqual(queue.shift(), { cost: 0, id: 2001 });
});
