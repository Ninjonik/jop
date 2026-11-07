/** Replay bridge HTTP contracts through real handlers and isolated Mongo state. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import { GET as bridgeScripts } from '../src/app/api/roblox/bridge-scripts/route';
import { POST as heartbeat } from '../src/app/api/roblox/sessions/[sessionId]/heartbeat/route';
import { POST as occupation } from '../src/app/api/roblox/sessions/[sessionId]/occupation/route';
import { POST as switchFeedback } from '../src/app/api/roblox/sessions/[sessionId]/switch-feedback/route';
import { GET as updates } from '../src/app/api/roblox/sessions/[sessionId]/updates/route';
import { POST as register } from '../src/app/api/roblox/sessions/register/route';
import { stateGroups, tiles } from '../src/app/data/tiles';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { robloxRuntimeInterpreter } from '../src/lib/server/roblox/roblox-open-cloud-port';
import { notifyRuntimeInterpreter } from '../src/lib/server/roblox/runtime-interpreter';
import { stationService } from '../src/lib/server/services/station-service';
import { createInitialStationLayout, placePieceAt } from '../src/lib/station/layout';

const sessionId = `bridgeqa-${randomUUID()}`;
const universeId = '999999999999';
const placeId = String(Date.now());
const stationId = 'bridge-qa';
// Synthetic secret is local to this process. Never transmit or log production credentials.
process.env.ROBLOX_INBOUND_SECRET = randomUUID();
const publication = mock.method(robloxRuntimeInterpreter, 'sessionChanged', async () => {});
const context = { params: Promise.resolve({ sessionId }) };
function request(path: string, body?: unknown) {
  return new Request(`https://example.test/api/roblox/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Authorization: `Bearer ${process.env.ROBLOX_INBOUND_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function json(response: Response, expected = 200) {
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}

async function verify() {
  const db = await getMongoDb();
  const layout = createInitialStationLayout(2, 2, tiles, stateGroups);
  const pieceId = placePieceAt(layout, 'singleSwitch', 0, 0, tiles, stateGroups);
  const now = new Date().toISOString();
  await db.collection('roblox_place_templates').insertOne({
    _id: `${universeId}:${placeId}` as never,
    universeId,
    placeId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    schema: { version: 1, stations: [{ stationId, layout }], lineblockLinks: [] },
  });
  const registration = { sessionId, universeId, placeId, serverId: sessionId };
  const init = await json(await register(request('sessions/register', registration)), 201);
  assert.equal(init.snapshot.protocolVersion, 1);
  assert.equal(init.snapshot.sessionId, sessionId);
  assert.equal(init.snapshot.stations[0].pieces[pieceId].type, 'singleSwitch');
  assert.equal(init.cursor, 0);
  const beat = await json(
    await heartbeat(request(`sessions/${sessionId}/heartbeat`, { serverId: sessionId }), context),
  );
  assert.equal(beat.isLive, true);
  const persisted = await db.collection('sessions').findOne({ _id: sessionId as never });
  assert.equal(persisted?.interpreter.heartbeat.lastHeartbeatAt, beat.lastHeartbeatAt);
  await json(await register(request('sessions/register', registration)), 201);
  assert.equal(
    await db.collection('stations').countDocuments({ sessionId }),
    1,
    'Retries must not duplicate stations',
  );
  const event = { eventId: randomUUID(), stationId, pieceId, observedAt: new Date().toISOString() };
  const occupied = await json(
    await occupation(
      request(`sessions/${sessionId}/occupation`, {
        events: [{ ...event, occupied: true, traversalState: 'blTbr' }],
      }),
      context,
    ),
  );
  assert.equal(occupied.applied, true);
  const occupiedSession = await db.collection('sessions').findOne({ _id: sessionId as never });
  assert.equal(
    occupiedSession?.runtime.physicalOccupations[`${stationId}:${pieceId}:blTbr`].occupied,
    true,
  );
  const clear = {
    ...event,
    eventId: randomUUID(),
    observedAt: new Date().toISOString(),
    occupied: false,
    traversalState: 'blTbr',
  };
  await json(await occupation(request(`sessions/${sessionId}/occupation`, clear), context));
  const feedback = {
    ...event,
    eventId: randomUUID(),
    observedAt: new Date().toISOString(),
    controlSlot: 'main',
    position: 'right',
  };
  const switched = await json(
    await switchFeedback(
      request(`sessions/${sessionId}/switch-feedback`, { events: [feedback] }),
      context,
    ),
  );
  assert.equal(switched.applied, true);
  const station = await db.collection('stations').findOne({ sessionId, stationId });
  assert.equal(station?.runtime.switchAlignments[pieceId].motorPositions.main, 'right');
  await notifyRuntimeInterpreter(sessionId, () =>
    stationService.getRobloxPhysicalSnapshot(sessionId),
  );
  const delta = await json(
    await updates(request(`sessions/${sessionId}/updates?afterSequence=0`), context),
  );
  assert(delta.updates.length > 0);
  assert.equal(delta.updates.at(-1).piece.switchAlignment.motorPositions.main, 'right');
  const acknowledged = await json(
    await updates(request(`sessions/${sessionId}/updates?afterSequence=${delta.cursor}`), context),
  );
  assert.equal(acknowledged.updates.length, 0);
  assert.equal(await db.collection('roblox_runtime_updates').countDocuments({ sessionId }), 0);
  const bundle = await json(await bridgeScripts(request('bridge-scripts')));
  assert.equal(bundle.scripts.length, 8);
  assert(
    bundle.scripts
      .find((script: { name: string }) => script.name === 'JopBridge')
      .source.includes('HEARTBEAT_INTERVAL_SECONDS = 20'),
  );
  const unauthorized = request(`sessions/${sessionId}/heartbeat`, { serverId: sessionId });
  unauthorized.headers.delete('Authorization');
  await json(await heartbeat(unauthorized, context), 401);
  await json(await heartbeat(request(`sessions/${sessionId}/heartbeat`, {}), context), 400);
  console.log(
    'Registration, heartbeat, sensor feedback, queued deltas, acknowledgements, auth and downloadable scripts passed against MongoDB.',
  );
}

async function main() {
  try {
    await verify();
  } finally {
    publication.mock.restore();
    const db = await getMongoDb();
    for (const collection of [
      'stations',
      'station_actions',
      'roblox_runtime_state',
      'roblox_runtime_updates',
    ])
      await db.collection(collection).deleteMany({ sessionId });
    await db.collection('sessions').deleteOne({ _id: sessionId as never });
    await db.collection('roblox_place_templates').deleteOne({ universeId, placeId });
    await (await getMongoClient()).close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
