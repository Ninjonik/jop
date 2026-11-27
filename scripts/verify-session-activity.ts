import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { GET as getActivity } from '../apps/api/src/app/api/sessions/[sessionId]/activity/route';
import { stateGroups, tiles } from '../src/app/data/tiles';
import { pruneSessionArtifacts } from '../src/lib/server/dis/session-artifacts';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { sessionActivityRepository } from '../src/lib/server/repositories/session-activity-repository';
import { stationActionLogRepository } from '../src/lib/server/repositories/station-action-log-repository';
import { stationRepository } from '../src/lib/server/repositories/station-repository';
import { flushSessionActivity, recordSessionActivity } from '../src/lib/server/session-activity';
import { withSessionActivity } from '../src/lib/server/session-activity-http';
import { sessionDocumentSchema, stationDocumentSchema } from '../src/lib/station/domain';
import { createInitialStationLayout, placePieceAt } from '../src/lib/station/layout';

async function main() {
  process.env.JOP_RUNTIME_DEBUG = 'false';
  const db = await getMongoDb();
  const sessionId = `activity-qa-${randomUUID()}`;
  const now = new Date().toISOString();
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
    const denied = await getActivity(new Request('http://localhost/activity'), {
      params: Promise.resolve({ sessionId }),
    });
    assert.equal(denied.status, 401);
    const layout = createInitialStationLayout(2, 1, tiles, stateGroups);
    const pieceId = placePieceAt(layout, 'track', 0, 0, tiles, stateGroups);
    await stationRepository.create(
      stationDocumentSchema.parse({
        _id: `${sessionId}:test`,
        sessionId,
        stationId: 'test',
        layout,
        revision: 0,
        createdAt: now,
        updatedAt: now,
        runtime: {
          pendingActions: {},
          activeTrainRoutes: {},
          switchAlignments: {},
          lineblockPremainLinks: {},
          premainSignalStates: {},
          routeSelection: null,
        },
      }),
    );
    const station = (await stationRepository.findBySessionAndStationId(sessionId, 'test'))!;
    station.layout.pieces[pieceId].state.groups.occupation = {
      state: 'occupied',
      variant: 'occupied',
    };
    station.revision++;
    await stationRepository.save(station);
    await stationActionLogRepository.create({
      _id: `${sessionId}:action`,
      sessionId,
      stationId: 'test',
      actionId: 'action-1',
      type: 'route:build-normal',
      status: 'completed',
      issuedAt: now,
      startedAt: now,
      finishedAt: now,
      payload: {},
    });
    for (let revision = 0; revision < 103; revision++) {
      recordSessionActivity({
        sessionId,
        stationId: 'test',
        source: 'server',
        event: 'fixture',
        level: 'info',
        revision,
      });
    }
    const handler = withSessionActivity('command', 'fixture-command', async (request: Request) => {
      await request.json();
      return Response.json({ error: { message: 'PRIVATE_UPSTREAM_ERROR' } }, { status: 409 });
    });
    await handler(
      new Request('http://localhost/fixture', {
        method: 'POST',
        headers: { Authorization: 'Bearer PRIVATE_TOKEN' },
        body: JSON.stringify({
          commandId: 'command-1',
          secret: 'PRIVATE_SECRET',
          payload: { pieceId: 'p1', notes: 'PRIVATE_NOTES' },
        }),
      }),
      { params: Promise.resolve({ sessionId, stationId: 'test' }) },
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    await flushSessionActivity();
    const first = await sessionActivityRepository.list(sessionId);
    assert.equal(first.entries.length, 100);
    assert.ok(first.nextCursor);
    const second = await sessionActivityRepository.list(sessionId, first.nextCursor!);
    assert.equal(second.entries.length, 7);
    assert.equal(new Set([...first.entries, ...second.entries].map((entry) => entry.id)).size, 107);
    const all = [...first.entries, ...second.entries];
    const persisted = all.find((entry) => entry.event === 'station.persisted');
    assert.equal(persisted?.details?.changedPieceCount, 1);
    assert.equal(persisted?.revision, 1);
    assert.ok(
      all.some((entry) => entry.event === 'action.completed' && entry.correlationId === 'action-1'),
    );
    const failed = first.entries.find((entry) => entry.event === 'fixture-command.failed');
    assert.equal(failed?.details?.status, 409);
    assert.equal(failed?.details?.commandId, 'command-1');
    assert.ok(failed?.correlationId);
    assert.equal(typeof failed?.durationMs, 'number');
    assert.ok(!JSON.stringify([...first.entries, ...second.entries]).includes('PRIVATE_'));
    await db
      .collection('sessions')
      .updateOne({ _id: sessionId } as never, { $set: { status: 'closed' } });
    await pruneSessionArtifacts(sessionId);
    assert.equal((await sessionActivityRepository.list(sessionId)).entries.length, 0);
    recordSessionActivity({ sessionId, source: 'server', event: 'late-fixture', level: 'info' });
    await flushSessionActivity();
    assert.equal((await sessionActivityRepository.list(sessionId)).entries.length, 0);
    console.log(
      'Activity persisted with debug disabled; paging, correlation, redaction, cleanup and late-write rejection passed.',
    );
  } finally {
    await flushSessionActivity();
    await db.collection('session_activity').deleteMany({ sessionId });
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
