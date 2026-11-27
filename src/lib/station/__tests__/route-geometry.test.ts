import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getPieceAnchor as originalAnchor,
  getPieceCells as originalCells,
  type StationLayout,
} from '../layout';
import { getPieceAnchor, getPieceCells, indexRouteGeometry } from '../route-geometry';

test('search geometry matches layout traversal and rebuilds for edited maps', () => {
  const layout: StationLayout = {
    width: 3,
    height: 2,
    pieces: {},
    connections: {},
    map: [
      ['a.0', 'b.0', 'a.1'],
      ['b.1', 'a.2', 'c.0'],
    ],
  };
  const view = indexRouteGeometry(layout);
  for (const id of ['a', 'b', 'c', 'missing']) {
    assert.deepEqual(getPieceCells(view, id), originalCells(layout, id));
    assert.deepEqual(getPieceAnchor(view, id), originalAnchor(layout, id));
  }
  layout.map[0][0] = 'c.1';
  const edited = indexRouteGeometry(layout);
  assert.deepEqual(getPieceCells(edited, 'c'), originalCells(layout, 'c'));
  assert.deepEqual(getPieceCells(view, 'c'), [[2, 1]]);
});
