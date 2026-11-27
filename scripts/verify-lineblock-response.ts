/** Verify dispatcher responses do not wait for downstream interpreter work. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import { stateGroups, tiles } from '../src/app/data/tiles';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { mockRuntimeInterpreter } from '../src/lib/server/roblox/mock-roblox-port';
import { stationService } from '../src/lib/server/services/station-service';
import {
  sessionDocumentSchema,
  stationDocumentSchema,
  type StationDocument,
} from '../src/lib/station/domain';
import { createInitialStationLayout, placePieceAt } from '../src/lib/station/layout';

async function main() {
  const db = await getMongoDb();
  const sessionId = `lineblock-response-qa-${randomUUID()}`;
  const now = new Date().toISOString();
  let releaseNotification!: () => void;
  const notificationGate = new Promise<void>((resolve) => {
    releaseNotification = resolve;
  });
  let notificationCount = 0;
  let notificationsStarted!: () => void;
  const allNotificationsStarted = new Promise<void>((resolve) => {
    notificationsStarted = resolve;
  });
  const notification = mock.method(mockRuntimeInterpreter, 'sessionChanged', async (event) => {
    if (event.sessionId === sessionId) {
      // Read Mongo during publication to prove both endpoints were written first.
      const stations = await db
        .collection<StationDocument>('stations')
        .find({ sessionId })
        .toArray();
      assert.equal(stations.length, 2);
      assert.ok(stations.every((station) => station.revision > 0));
      notificationCount++;
      if (notificationCount === 2) notificationsStarted();
      await notificationGate;
    }
  });
  try {
    const endpoints = ['a', 'b'].map((stationId) => {
      const layout = createInitialStationLayout(4, 3, tiles, stateGroups);
      const pieceId = placePieceAt(layout, 'lineblock', 0, 0, tiles, stateGroups);
      return {
        stationId,
        pieceId,
        station: stationDocumentSchema.parse({
          _id: randomUUID(),
          sessionId,
          stationId,
          revision: 0,
          layout,
          runtime: {
            pendingActions: {},
            lineblockPremainLinks: {},
            premainSignalStates: {},
            routeSelection: null,
            activeTrainRoutes: {},
            switchAlignments: {},
          },
          createdAt: now,
          updatedAt: now,
        }),
      };
    });
    const [a, b] = endpoints;
    await db.collection('sessions').insertOne(
      sessionDocumentSchema.parse({
        _id: sessionId,
        status: 'active',
        mockMode: true,
        createdAt: now,
        updatedAt: now,
        topology: {
          lineblockLinks: {
            link: {
              id: 'link',
              sessionId,
              a: { stationId: a.stationId, pieceId: a.pieceId },
              b: { stationId: b.stationId, pieceId: b.pieceId },
              defaultFlow: 'neutral',
              createdAt: now,
            },
          },
        },
        runtime: { trains: {}, lineblocks: {}, physicalOccupations: {} },
      }),
    );
    await db
      .collection<StationDocument>('stations')
      .insertMany(endpoints.map((endpoint) => endpoint.station));
    const command = (type: 'lineblock:grant-consent' | 'lineblock:revoke-consent') =>
      stationService.submitLineblockAction({
        commandId: randomUUID(),
        sessionId,
        stationId: a.stationId,
        type,
        issuedAt: now,
        actor: { type: 'user', id: 'lineblock-response-qa' },
        payload: { pieceId: a.pieceId },
      });
    const state = (station: StationDocument, pieceId: string) =>
      station.layout.pieces[pieceId].state.groups.lineblock.state;
    const start = performance.now();
    // The gate remains closed for both commands, including the second mutation.
    const granted = await command('lineblock:grant-consent');
    assert.equal(state(granted.localStation, a.pieceId), 'receivingFree');
    assert.equal(state(granted.remoteStation, b.pieceId), 'sendingFree');
    for (const station of [granted.localStation, granted.remoteStation]) {
      const persisted = await db
        .collection<StationDocument>('stations')
        .findOne({ _id: station._id });
      assert.deepEqual(persisted, station);
    }
    const revoked = await command('lineblock:revoke-consent');
    assert.equal(state(revoked.localStation, a.pieceId), 'default');
    assert.equal(state(revoked.remoteStation, b.pieceId), 'default');
    console.log(
      `Grant and revoke persisted and returned in ${Math.round(performance.now() - start)}ms while interpreter notification was blocked.`,
    );
    await allNotificationsStarted;
    releaseNotification();
    // Drain the instrumented notification promises before deleting fixtures.
    await Promise.all(notification.mock.calls.map((call) => call.result));
    assert.equal(notificationCount, 2);
    await assert.rejects(command('lineblock:revoke-consent'), /only be revoked/);
    console.log(
      'Both endpoints were persisted before notification; invalid state transitions remain rejected.',
    );
  } finally {
    releaseNotification();
    notification.mock.restore();
    await db.collection('stations').deleteMany({ sessionId });
    await db.collection('sessions').deleteOne({ _id: sessionId } as never);
    await db.collection('session_activity').deleteMany({ sessionId });
    await (await getMongoClient()).close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
