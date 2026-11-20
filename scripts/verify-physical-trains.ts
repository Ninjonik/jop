/** Real occupation API, GSM-R registration, dashboard and persisted station snapshots. */
import { Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import { POST as radio } from '../src/app/api/roblox/sessions/[sessionId]/gsm-r/route';
import { POST as occupation } from '../src/app/api/roblox/sessions/[sessionId]/occupation/route';
import { stateGroups, tiles } from '../src/app/data/tiles';
import type { UserProfile } from '../src/lib/dis/appwrite-client';
import { loadDriverDashboard } from '../src/lib/server/dis/driver-train';
import { getDisUniverseId } from '../src/lib/server/dis/places';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { robloxRuntimeInterpreter } from '../src/lib/server/roblox/roblox-open-cloud-port';
import { notifyRuntimeInterpreter } from '../src/lib/server/roblox/runtime-interpreter';
import { stationService } from '../src/lib/server/services/station-service';
import {
  sessionDocumentSchema,
  stationDocumentSchema,
  type StationDocument,
} from '../src/lib/station/domain';
import { createInitialStationLayout, placePieceAt } from '../src/lib/station/layout';
import { supportsPhysicalTrainLabel } from '../src/lib/station/physical-trains';

const sessionId = `physicalqa-${randomUUID()}`;
const sensorId = randomUUID(),
  secondSensor = randomUUID();
process.env.ROBLOX_INBOUND_SECRET = randomUUID();
const context = { params: Promise.resolve({ sessionId }) };
const profile = {
  userId: 'physical-qa-driver',
  role: 'driver',
  name: 'QA',
  callsign: 'ZSSK-042',
  robloxUserId: '12340',
} as UserProfile;
const second = {
  ...profile,
  userId: 'physical-qa-second',
  callsign: 'ZSSK-043',
  robloxUserId: '12341',
};
const timetable = {
  $id: 'qa-gvd',
  placeId: '123',
  trainNumber: '5001',
  trainType: 'R',
  maxSpeed: 100,
  trainLength: 100,
  stopsJson: JSON.stringify([
    { station: 'kolarovo', arrival: '10:00', departure: '10:01' },
    { station: 'vesele', arrival: '10:10', departure: '10:11' },
  ]),
};
const appwrite = mock.method(Databases.prototype, 'listDocuments', async (...args: unknown[]) => ({
  documents: args[1] === 'profiles' ? [profile, second] : [timetable],
}));
const notifications = mock.method(robloxRuntimeInterpreter, 'sessionChanged', async () => {});
function request(body: unknown) {
  return new Request('https://example.test', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.ROBLOX_INBOUND_SECRET}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
async function body(response: Response) {
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload;
}
let timestamp = Date.now();
async function occupy(
  stationId: string,
  pieceId: string,
  vehicles: { sensorId: string; distanceToFront?: number | null }[],
  occupied = true,
) {
  await body(
    await occupation(
      request({
        stationId,
        pieceId,
        vehicles,
        occupied,
        observedAt: new Date(++timestamp).toISOString(),
        eventId: randomUUID(),
      }),
      context,
    ),
  );
}
async function station(stationId = 'kolarovo') {
  const document = await (
    await getMongoDb()
  )
    .collection<StationDocument>('stations')
    .findOne({ sessionId, stationId });
  return stationDocumentSchema.parse(document);
}
async function run() {
  const db = await getMongoDb();
  try {
    await db.collection<{ _id: string }>('sessions').insertOne(
      sessionDocumentSchema.parse({
        _id: sessionId,
        status: 'active',
        mockMode: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        interpreter: {
          kind: 'roblox',
          universeId: getDisUniverseId(),
          placeId: '123',
          serverId: sessionId,
          heartbeat: { lastHeartbeatAt: new Date().toISOString() },
        },
        topology: { lineblockLinks: {} },
        runtime: { trains: {}, lineblocks: {}, physicalOccupations: {} },
      }),
    );
    const layout = createInitialStationLayout(5, 3, tiles, stateGroups);
    const rear = placePieceAt(layout, 'track', 0, 0, tiles, stateGroups);
    const front = placePieceAt(layout, 'track', 1, 0, tiles, stateGroups);
    const switchId = placePieceAt(layout, 'singleSwitch', 2, 0, tiles, stateGroups);
    const diagonal = placePieceAt(layout, 'trackDiagonalLong', 3, 0, tiles, stateGroups);
    const makeStation = (stationId: string): StationDocument =>
      Object.assign(
        stationDocumentSchema.parse({
          _id: randomUUID(),
          sessionId,
          stationId,
          revision: 0,
          layout,
          runtime: {
            pendingActions: {},
            lineblockPremainLinks: {},
            premainSignalStates: {},
            activeTrainRoutes: {},
            switchAlignments: {},
            activePrivolavaciaSignals: {},
            routeSelection: null,
            privolavaciaSelection: null,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        { layout },
      );
    await db
      .collection<StationDocument>('stations')
      .insertMany([makeStation('kolarovo'), makeStation('vesele')]);
    await db.collection<{ _id: string }>('session_driver_trains').insertMany([
      {
        _id: `${sessionId}-one`,
        ...{
          sessionId,
          userId: profile.userId,
          trainNumber: '5001',
          timetableId: 'qa-gvd',
          trainType: 'Os',
        },
      },
      {
        _id: `${sessionId}-two`,
        ...{
          sessionId,
          userId: second.userId,
          trainNumber: '9001',
          timetableId: null,
          trainType: 'Ex',
        },
      },
    ]);
    await body(
      await radio(request({ type: 'initialize', sensorIds: [sensorId, secondSensor] }), context),
    );
    const registration = {
      type: 'register',
      sensorId,
      actorUserId: '12340',
      driverId: '042',
      trainNumber: '5001',
      functionCode: '01',
      expectedRevision: 0,
    };
    assert.equal(
      (await body(await radio(request(registration), context))).vehicle.binding.trainType,
      'R',
      'GVD overrides dashboard category',
    );
    assert.equal((await loadDriverDashboard(sessionId, profile)).radio?.connected, true);
    assert.equal((await loadDriverDashboard(sessionId, profile)).radio?.stationName, null);
    await occupy('kolarovo', rear, [{ sensorId }]); // no measured direction, one known section
    assert.equal((await station()).runtime.physicalTrainLabels[rear].text, 'R 5001');
    assert.equal((await loadDriverDashboard(sessionId, profile)).radio?.stationName, 'Kolárovo');
    await occupy('kolarovo', front, [{ sensorId, distanceToFront: -2 }]);
    let snapshot = await station();
    assert.equal(snapshot.runtime.physicalTrainLabels[front].text, 'R 5001');
    assert.equal(snapshot.runtime.physicalTrainLabels[rear], undefined);
    await occupy('kolarovo', switchId, [{ sensorId, distanceToFront: -4 }]);
    await occupy('kolarovo', diagonal, [{ sensorId, distanceToFront: -5 }]);
    snapshot = await station();
    assert.equal(snapshot.runtime.physicalTrainLabels[front].text, 'R 5001');
    assert(
      !supportsPhysicalTrainLabel('singleSwitch') &&
        !supportsPhysicalTrainLabel('trackDiagonalLong'),
    );
    // Direction reversal updates identity metadata without changing occupation.
    await occupy('kolarovo', rear, [{ sensorId, distanceToFront: -8 }]);
    snapshot = await station();
    assert.equal(snapshot.runtime.physicalTrainLabels[rear].text, 'R 5001');
    assert.equal(snapshot.layout.pieces[front].state.groups.occupation.state, 'occupied');
    const custom = {
      ...registration,
      sensorId: secondSensor,
      actorUserId: '12341',
      driverId: '043',
      trainNumber: '9001',
    };
    const customBinding = (await body(await radio(request(custom), context))).vehicle.binding;
    assert.equal(customBinding.trainType, 'Pos');
    assert.equal(customBinding.timetableId, null);
    await occupy('kolarovo', rear, [
      { sensorId, distanceToFront: -8 },
      { sensorId: secondSensor, distanceToFront: 0 },
    ]);
    assert.equal((await station()).runtime.physicalTrainLabels[rear].text, 'Pos 9001, R 5001');
    await occupy('vesele', front, [{ sensorId, distanceToFront: -20 }]);
    assert.equal((await station('vesele')).runtime.physicalTrainLabels[front].text, 'R 5001');
    assert.equal((await station()).runtime.physicalTrainLabels[rear].text, 'Pos 9001');
    assert.equal((await loadDriverDashboard(sessionId, profile)).radio?.stationName, 'Veselé');
    await body(
      await radio(
        request({ type: 'deregister', sensorId, actorUserId: '12340', expectedRevision: 1 }),
        context,
      ),
    );
    assert.equal(Object.keys((await station('vesele')).runtime.physicalTrainLabels).length, 0);
    assert.equal((await loadDriverDashboard(sessionId, profile)).radio, null);
    await occupy('kolarovo', rear, [], false);
    assert.equal(Object.keys((await station()).runtime.physicalTrainLabels).length, 0);
    await db.collection<{ _id: string }>('sessions').updateOne(
      { _id: sessionId },
      {
        $set: {
          'interpreter.heartbeat.lastHeartbeatAt': new Date(Date.now() - 120000).toISOString(),
        },
      },
    );
    assert.equal((await loadDriverDashboard(sessionId, second)).radio?.connected, false);
    assert.equal((await loadDriverDashboard(sessionId, second)).radio?.stationName, null);
    // Flush queued interpreter work before removing the isolated fixtures.
    await notifyRuntimeInterpreter(sessionId, () =>
      stationService.getRobloxPhysicalSnapshot(sessionId),
    );
    console.log(
      'Physical train identity, frontmost labels, reversal, exclusions, shared sensors, GVD/Pos category, dashboard position and deregistration passed.',
    );
  } finally {
    appwrite.mock.restore();
    notifications.mock.restore();
    await Promise.all(
      [
        'stations',
        'sessions',
        'gsm_r_vehicles',
        'session_driver_trains',
        'roblox_runtime_state',
        'roblox_runtime_updates',
        'station_actions',
      ].map((name) =>
        db
          .collection(name)
          .deleteMany(name === 'sessions' ? { _id: sessionId as never } : { sessionId }),
      ),
    );
    await (await getMongoClient()).close();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
