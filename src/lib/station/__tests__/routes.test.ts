import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stateGroups } from '@/app/data/_tiles/state-groups';
import { tiles } from '@/app/data/tiles';
import type { StationDocument } from '../domain';
import { serializeStationLayout } from '../domain';
import { createInitialStationLayout, placePieceAt } from '../layout';
import { buildRouteFromSelection } from '../routes';

function createTestStation(): StationDocument {
  const layout = createInitialStationLayout(10, 5, tiles, stateGroups);

  // Layout track:
  // (x=1, y=2): shuntButton ('btn1')
  // (x=2, y=2): shuntSignal ('sig1')
  // (x=3, y=2): track ('trk1')
  // (x=4, y=2): shuntButton ('btn2')
  // (x=5, y=2): shuntSignal ('sig2')
  // (x=6, y=2): track ('trk2')
  // (x=7, y=2): shuntButton ('btn3')
  placePieceAt(layout, 'shuntButton', 1, 2, tiles, stateGroups);
  placePieceAt(layout, 'shuntSignal', 2, 2, tiles, stateGroups);
  placePieceAt(layout, 'track', 3, 2, tiles, stateGroups);
  placePieceAt(layout, 'shuntButton', 4, 2, tiles, stateGroups);
  placePieceAt(layout, 'shuntSignal', 5, 2, tiles, stateGroups);
  placePieceAt(layout, 'track', 6, 2, tiles, stateGroups);
  placePieceAt(layout, 'shuntButton', 7, 2, tiles, stateGroups);

  return {
    _id: 'test-station',
    sessionId: 'test-session',
    stationId: 'test-station',
    revision: 0,
    layout: serializeStationLayout(layout),
    runtime: {
      pendingActions: {},
      lineblockPremainLinks: {},
      premainSignalStates: {},
      privolavaciaSelection: null,
      activePrivolavaciaSignals: {},
      routeSelection: null,
      activeTrainRoutes: {},
      switchAlignments: {},
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

test('shunting route does not reserve the ending target shunt control tile', () => {
  const station = createTestStation();
  const pieces = station.layout.pieces;
  const btn1 = Object.keys(pieces).find((id) => pieces[id].type === 'shuntButton' && station.layout.map[2][1].startsWith(id))!;
  const trk1 = Object.keys(pieces).find((id) => pieces[id].type === 'track' && station.layout.map[2][3].startsWith(id))!;
  const btn2 = Object.keys(pieces).find((id) => pieces[id].type === 'shuntButton' && station.layout.map[2][4].startsWith(id))!;

  const route = buildRouteFromSelection(
    station,
    btn1,
    btn2,
    tiles,
    'shunt',
    true,
    'shunt',
  );

  // The intermediate track trk1 should be reserved
  assert.ok(route.reservedOccupations.some((occ) => occ.pieceId === trk1));

  // The target shunt button btn2 should NOT be reserved
  assert.ok(!route.reservedOccupations.some((occ) => occ.pieceId === btn2));
});

test('shunting route can be built even if the target shunt button is occupied or has a route ending there', () => {
  const station = createTestStation();
  const pieces = station.layout.pieces;
  const btn1 = Object.keys(pieces).find((id) => pieces[id].type === 'shuntButton' && station.layout.map[2][1].startsWith(id))!;
  const trk1 = Object.keys(pieces).find((id) => pieces[id].type === 'track' && station.layout.map[2][3].startsWith(id))!;
  const btn2 = Object.keys(pieces).find((id) => pieces[id].type === 'shuntButton' && station.layout.map[2][4].startsWith(id))!;

  // Mark btn2 as occupied
  station.layout.pieces[btn2].state.groups.occupation = {
    ...station.layout.pieces[btn2].state.groups.occupation!,
    state: 'occupied',
  };

  // Building route to btn2 should succeed because ending shunt button is not blocked by occupancy
  const route = buildRouteFromSelection(
    station,
    btn1,
    btn2,
    tiles,
    'shunt',
    true,
    'shunt',
  );

  assert.equal(route.sourcePieceId, btn1);
  assert.equal(route.targetPieceId, btn2);
  assert.ok(route.reservedOccupations.some((occ) => occ.pieceId === trk1));
  assert.ok(!route.reservedOccupations.some((occ) => occ.pieceId === btn2));
});

test('subsequent shunting route starting from btn2 can be built while route 1 terminates at btn2', () => {
  const station = createTestStation();
  const pieces = station.layout.pieces;
  const btn1 = Object.keys(pieces).find((id) => pieces[id].type === 'shuntButton' && station.layout.map[2][1].startsWith(id))!;
  const btn2 = Object.keys(pieces).find((id) => pieces[id].type === 'shuntButton' && station.layout.map[2][4].startsWith(id))!;
  const trk2 = Object.keys(pieces).find((id) => pieces[id].type === 'track' && station.layout.map[2][6].startsWith(id))!;
  const btn3 = Object.keys(pieces).find((id) => pieces[id].type === 'shuntButton' && station.layout.map[2][7].startsWith(id))!;

  // Build first route from btn1 to btn2
  const route1 = buildRouteFromSelection(
    station,
    btn1,
    btn2,
    tiles,
    'shunt',
    true,
    'shunt',
  );

  // Apply route1 reservations onto station layout
  route1.reservedOccupations.forEach((occ) => {
    station.layout.pieces[occ.pieceId].state.groups.occupation = {
      ...station.layout.pieces[occ.pieceId].state.groups.occupation!,
      state: 'reserved',
    };
  });

  // Now build second route from btn2 to btn3
  const route2 = buildRouteFromSelection(
    station,
    btn2,
    btn3,
    tiles,
    'shunt',
    true,
    'shunt',
  );

  assert.equal(route2.sourcePieceId, btn2);
  assert.equal(route2.targetPieceId, btn3);
  assert.ok(route2.reservedOccupations.some((occ) => occ.pieceId === trk2));
  assert.ok(!route2.reservedOccupations.some((occ) => occ.pieceId === btn3));
});
