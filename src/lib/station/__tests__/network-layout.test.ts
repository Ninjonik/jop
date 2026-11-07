import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SessionLineblockLink } from '../domain';
import { arrangeStationNetwork, networkCardHeight, networkCardWidth } from '../network-layout';

function link(a: string, b: string): SessionLineblockLink {
  return {
    id: `${a}-${b}`,
    sessionId: 'test',
    a: { stationId: a, pieceId: 'a' },
    b: { stationId: b, pieceId: 'b' },
    defaultFlow: 'neutral',
    createdAt: '',
  };
}

test('connected chains run alongside each other and isolated stations wait below', () => {
  const network = arrangeStationNetwork(
    ['a', 'b', 'c', 'waiting'],
    [link('a', 'b'), link('b', 'c')],
  );
  const a = network.positions.get('a')!;
  const b = network.positions.get('b')!;
  const c = network.positions.get('c')!;
  assert.ok(a.x < b.x && b.x < c.x);
  assert.equal(a.y, c.y);
  assert.ok(network.positions.get('waiting')!.y > c.y + networkCardHeight);
  assert.deepEqual(
    network.sections.map((section) => section.label),
    ['connected', 'waiting'],
  );
});

test('branches, cycles, parallel links and separate components do not overlap or duplicate stations', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'waiting'];
  const links = [
    link('a', 'b'),
    link('a', 'c'),
    link('a', 'd'),
    link('b', 'c'),
    link('a', 'b'),
    link('e', 'f'),
    link('a', 'missing'),
  ];
  const network = arrangeStationNetwork(ids, links);
  assert.equal(network.positions.size, ids.length);
  const positions = [...network.positions.values()];
  for (let i = 0; i < positions.length; i++) {
    const a = positions[i];
    assert.ok(a.x + networkCardWidth <= network.width);
    assert.ok(a.y + networkCardHeight <= network.height);
    for (const b of positions.slice(i + 1)) {
      assert.ok(
        Math.abs(a.x - b.x) >= networkCardWidth || Math.abs(a.y - b.y) >= networkCardHeight,
      );
    }
  }
  assert.deepEqual(arrangeStationNetwork(ids, links), network);
});

test('empty and entirely unconnected networks remain usable', () => {
  assert.equal(arrangeStationNetwork([], []).positions.size, 0);
  const network = arrangeStationNetwork(['a', 'b', 'c', 'd'], []);
  assert.equal(network.positions.size, 4);
  assert.deepEqual(
    network.sections.map((section) => section.label),
    ['waiting'],
  );
  assert.ok(network.positions.get('d')!.y > network.positions.get('a')!.y);
});
