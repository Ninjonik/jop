/** Assert every persisted route-build snapshot retains physical occupancy. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import { stateGroups, tiles } from '../src/app/data/tiles';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { stationRepository } from '../src/lib/server/repositories/station-repository';
import { stationService } from '../src/lib/server/services/station-service';
import {
  sessionDocumentSchema,
  stationDocumentSchema,
  type StationDocument,
} from '../src/lib/station/domain';
import { createInitialStationLayout, placePieceAt } from '../src/lib/station/layout';

async function main() {
  const db = await getMongoDb();
  const sessionId = `route-occupancy-qa-${randomUUID()}`;
  const now = new Date().toISOString();
  const persisted: StationDocument[] = [];
  const originalSave = stationRepository.save;
  const saves = mock.method(stationRepository, 'save', async (station: StationDocument) => {
    const result = await originalSave(station);
    if (station.sessionId === sessionId) {
      const saved = await db.collection<StationDocument>('stations').findOne({ _id: station._id });
      assert.ok(saved);
      persisted.push(saved);
    }
    return result;
  });
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
    for (const control of ['normal', 'shunt'] as const) {
      const stationId = control;
      const layout = createInitialStationLayout(6, 3, tiles, stateGroups);
      const source = placePieceAt(layout, 'departureButton', 0, 0, tiles, stateGroups);
      const signal = placePieceAt(layout, 'departureSignal', 1, 0, tiles, stateGroups);
      layout.pieces[signal].rotation = 180;
      placePieceAt(layout, 'premainSignal', 2, 0, tiles, stateGroups);
      const target = placePieceAt(layout, 'shuntButton', 3, 0, tiles, stateGroups);
      const occupied = placePieceAt(layout, 'track', 0, 2, tiles, stateGroups);
      const station = stationDocumentSchema.parse({
        _id: randomUUID(),
        sessionId,
        stationId,
        revision: 0,
        layout,
        runtime: {
          pendingActions: {},
          activeTrainRoutes: {},
          switchAlignments: {},
          lineblockPremainLinks: {},
          premainSignalStates: {},
          routeSelection: null,
          physicalTrainLabels: { [occupied]: { text: 'R 5001' } },
        },
        createdAt: now,
        updatedAt: now,
      });
      await db.collection<StationDocument>('stations').insertOne(station);
      await db.collection('sessions').updateOne({ _id: sessionId } as never, {
        $set: {
          [`runtime.physicalOccupations.${stationId}`]: {
            stationId,
            pieceId: occupied,
            traversalState: null,
            occupied: true,
            vehicles: [],
            observedAt: now,
            eventId: randomUUID(),
          },
        },
      });
      const interact = (pieceId: string) =>
        stationService.submitRouteInteract({
          commandId: randomUUID(),
          sessionId,
          stationId,
          issuedAt: now,
          type: 'route:interact',
          payload: { pieceId, button: 'left', control },
        });
      await interact(source);
      const queued = await interact(target);
      assert.equal(queued.kind, 'build-queued');
      const deadline = Date.now() + 10000;
      while (
        !persisted.some(
          (s) => s.stationId === stationId && Object.keys(s.runtime.activeTrainRoutes).length,
        )
      ) {
        assert.ok(Date.now() < deadline, 'Route did not complete');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const snapshots = persisted.filter((s) => s.stationId === stationId);
      assert.ok(
        snapshots.some((s) =>
          Object.values(s.runtime.pendingActions).some((a) => a.status === 'running'),
        ),
      );
      for (const snapshot of snapshots) {
        assert.equal(
          snapshot.layout.pieces[occupied].state.groups.occupation.state,
          'occupied',
          `${control} route revision ${snapshot.revision} lost occupation`,
        );
        assert.equal(
          snapshot.runtime.physicalTrainLabels[occupied]?.text,
          'R 5001',
          `${control} route revision ${snapshot.revision} lost the persisted train label`,
        );
      }
      console.log(`${control}: queued, running and completed persisted snapshots retain occupancy`);
    }
  } finally {
    saves.mock.restore();
    await db.collection('stations').deleteMany({ sessionId });
    await db.collection('station_actions').deleteMany({ sessionId });
    await db.collection('sessions').deleteOne({ _id: sessionId } as never);
    await (await getMongoClient()).close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
