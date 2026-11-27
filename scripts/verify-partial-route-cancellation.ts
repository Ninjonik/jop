import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { stateGroups, tiles } from '../src/app/data/tiles';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { stationService } from '../src/lib/server/services/station-service';
import { flushSessionActivity } from '../src/lib/server/session-activity';
import { sessionDocumentSchema, stationDocumentSchema } from '../src/lib/station/domain';
import { createInitialStationLayout, placePieceAt } from '../src/lib/station/layout';
import { buildRouteFromSelection } from '../src/lib/station/routes';

async function main() {
  const db = await getMongoDb();
  const sessionId = `partial-qa-${randomUUID()}`;
  const now = new Date().toISOString();
  let timersUntil = Date.now();
  try {
    await db.collection('sessions').insertOne(
      sessionDocumentSchema.parse({
        _id: sessionId,
        status: 'active',
        mockMode: true,
        createdAt: now,
        updatedAt: now,
        topology: { lineblockLinks: {} },
        runtime: { trains: {}, lineblocks: {}, physicalOccupations: {} },
      }),
    );
    for (const routeType of ['shunt', 'normal'] as const) {
      const layout = createInitialStationLayout(10, 3, tiles, stateGroups);
      const source = placePieceAt(
        layout,
        routeType === 'shunt' ? 'shuntButton' : 'departureButton',
        1,
        1,
        tiles,
        stateGroups,
      );
      const sourceSignal = placePieceAt(
        layout,
        routeType === 'shunt' ? 'shuntSignal' : 'departureSignal',
        2,
        1,
        tiles,
        stateGroups,
      );
      if (routeType === 'normal') layout.pieces[sourceSignal].rotation = 180;
      placePieceAt(layout, 'track', 3, 1, tiles, stateGroups);
      const middle = placePieceAt(layout, 'shuntButton', 4, 1, tiles, stateGroups);
      placePieceAt(layout, 'shuntSignal', 5, 1, tiles, stateGroups);
      const suffix = placePieceAt(layout, 'track', 6, 1, tiles, stateGroups);
      const target = placePieceAt(layout, 'shuntButton', 7, 1, tiles, stateGroups);
      const station = stationDocumentSchema.parse({
        _id: `${sessionId}:${routeType}`,
        sessionId,
        stationId: routeType,
        revision: 0,
        layout,
        createdAt: now,
        updatedAt: now,
        runtime: {
          pendingActions: {},
          activeTrainRoutes: {},
          switchAlignments: {},
          routeSelection: null,
          lineblockPremainLinks: {},
          premainSignalStates: {},
        },
      });
      const built = buildRouteFromSelection(station, source, target, tiles, routeType, false);
      const routeId = randomUUID();
      station.runtime.activeTrainRoutes[routeId] = {
        ...built,
        id: routeId,
        sourceControl: routeType,
        targetControl: 'shunt',
        passedSignalPieceIds: [],
        createdAt: now,
      };
      await db.collection('stations').insertOne(station);
      const command = () => ({
        commandId: randomUUID(),
        sessionId,
        stationId: routeType,
        type: 'route:interact' as const,
        issuedAt: now,
        actor: { type: 'user' as const, id: 'fixture' },
        payload: {
          pieceId: middle,
          button: 'right' as const,
          control: routeType,
          emergencyCancel: true,
          partialCancelRouteId: routeId,
        },
      });
      const before = (await stationService.getStation(sessionId, routeType))!;
      const route = before.runtime.activeTrainRoutes[routeId];
      const boundary = route.path.findIndex((step) => step.pieceId === middle);
      assert.ok(boundary > 0);
      // Authoritative physical occupancy rejects the operation without mutating the route.
      await db.collection('sessions').updateOne({ _id: sessionId } as never, {
        $set: {
          [`runtime.physicalOccupations.${routeType}`]: {
            stationId: routeType,
            pieceId: suffix,
            occupied: true,
            traversalState: null,
            vehicles: [],
            observedAt: now,
            eventId: randomUUID(),
          },
        },
      });
      await assert.rejects(stationService.submitRouteInteract(command()), /occupied/);
      assert.equal(
        (await stationService.getStation(sessionId, routeType))!.runtime.activeTrainRoutes[routeId]
          .targetPieceId,
        target,
      );
      await db.collection('sessions').updateOne({ _id: sessionId } as never, {
        $unset: { [`runtime.physicalOccupations.${routeType}`]: '' },
      });
      // A suffix whose reservations have already been released is rejected too.
      const missing = structuredClone(station);
      missing.runtime.activeTrainRoutes[routeId].reservedOccupations =
        route.reservedOccupations.filter((reservation) => reservation.pieceId !== suffix);
      await db.collection('stations').replaceOne({ _id: station._id } as never, missing);
      await assert.rejects(stationService.submitRouteInteract(command()), /fully reserved/);
      await db.collection('stations').replaceOne({ _id: station._id } as never, station);
      const result = await stationService.submitRouteInteract(command());
      assert.equal(result.kind, 'suffix-cancelled');
      const saved = (await stationService.getStation(sessionId, routeType))!;
      const retained = saved.runtime.activeTrainRoutes[routeId];
      assert.deepEqual(retained.path, route.path.slice(0, boundary));
      assert.equal(retained.sourcePieceId, source);
      assert.equal(retained.targetPieceId, middle);
      assert.ok(
        !retained.reservedOccupations.some((reservation) =>
          [middle, suffix, target].includes(reservation.pieceId),
        ),
      );
      const prefixIds = new Set(retained.path.map((step) => step.pieceId));
      assert.deepEqual(
        retained.reservedOccupations,
        route.reservedOccupations.filter((reservation) => prefixIds.has(reservation.pieceId)),
      );
      const cancel = command();
      cancel.payload.pieceId = source;
      delete (cancel.payload as { partialCancelRouteId?: string }).partialCancelRouteId;
      cancel.payload.emergencyCancel = false;
      const pending = await stationService.submitRouteInteract(cancel);
      assert.equal(pending.kind, 'cancel-queued');
      if ('action' in pending && pending.action?.dueAt)
        timersUntil = Math.max(timersUntil, Date.parse(pending.action.dueAt) + 300);
      // Finish through the existing source emergency-cancel flow and verify removal.
      cancel.commandId = randomUUID();
      cancel.payload.emergencyCancel = true;
      await stationService.submitRouteInteract(cancel);
      assert.ok(
        !(await stationService.getStation(sessionId, routeType))!.runtime.activeTrainRoutes[
          routeId
        ],
      );
      console.log(
        `${routeType}: occupied/released suffix rejected, prefix retained, source cancellation completes`,
      );
    }
  } finally {
    // Ordinary cancellation timers remain scheduled after emergency completion.
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, timersUntil - Date.now())));
    await flushSessionActivity();
    for (const name of ['stations', 'station_actions', 'session_activity'])
      await db.collection(name).deleteMany({ sessionId });
    await db.collection('sessions').deleteOne({ _id: sessionId } as never);
    await (await getMongoClient()).close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
