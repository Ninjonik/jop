/** Real HTTP handlers and Mongo writes; only external Appwrite reads are fixtures. */
import { Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import { GET, POST } from '../src/app/api/roblox/sessions/[sessionId]/gsm-r/route';
import { getDisUniverseId } from '../src/lib/server/dis/places';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';

const sessionId = `gsmrqa-${randomUUID()}`;
const sensorId = randomUUID(),
  otherSensor = randomUUID();
process.env.ROBLOX_INBOUND_SECRET = randomUUID();
const context = { params: Promise.resolve({ sessionId }) };
const timetable = {
  $id: 'gsmr-qa-train',
  placeId: '123',
  trainNumber: '5001',
  trainType: 'Os',
  maxSpeed: 100,
  trainLength: 100,
  stopsJson: JSON.stringify([
    { station: 'a', arrival: '10:00', departure: '10:01' },
    { station: 'b', arrival: '10:10', departure: '10:11' },
  ]),
};
const profile = {
  $id: 'gsmr-qa-driver',
  userId: 'gsmr-qa-driver',
  role: 'driver',
  robloxUserId: '12340',
  callsign: 'ZSSK-042',
};
let duplicateCallsign = false;
const appwrite = mock.method(Databases.prototype, 'listDocuments', async (...args: unknown[]) => {
  const documents =
    args[1] === 'profiles'
      ? duplicateCallsign
        ? [profile, { ...profile, userId: 'other', robloxUserId: '777' }]
        : [profile]
      : args[1] === 'timetables_gvd'
        ? [timetable]
        : [];
  return { documents, total: documents.length };
});
function request(body?: unknown, authorized = true) {
  return new Request('https://example.test/gsm-r', {
    method: body ? 'POST' : 'GET',
    headers: {
      authorization: authorized ? `Bearer ${process.env.ROBLOX_INBOUND_SECRET}` : '',
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function post(body: unknown, status = 200) {
  const response = await POST(request(body), context);
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
}
async function verify() {
  const db = await getMongoDb();
  await db.collection<{ _id: string }>('sessions').insertOne({
    _id: sessionId,
    ...{
      status: 'active',
      interpreter: { kind: 'roblox', universeId: getDisUniverseId(), placeId: '123' },
    },
  });
  await db.collection<{ _id: string }>('session_driver_trains').insertOne({
    _id: sessionId,
    ...{
      sessionId,
      userId: profile.userId,
      trainNumber: '5001',
      timetableId: timetable.$id,
      trainType: 'Os',
    },
  });
  assert.equal((await GET(request(undefined, false), context)).status, 401);
  assert.equal(
    (await POST(request({ type: 'initialize', sensorIds: [sensorId] }, false), context)).status,
    401,
  );
  await post({ type: 'initialize', sensorIds: ['invalid'] }, 400);
  const initial = await post({ type: 'initialize', sensorIds: [sensorId, sensorId, otherSensor] });
  assert.equal(initial.vehicles.length, 2);
  await post({ type: 'initialize', sensorIds: [sensorId] });
  const command = {
    type: 'register',
    sensorId,
    actorUserId: '12340',
    driverId: '042',
    trainNumber: '5001',
    functionCode: '01',
    expectedRevision: 0,
  };
  await post({ ...command, driverId: '043' }, 403);
  await post({ ...command, driverId: '12340' }, 400);
  duplicateCallsign = true;
  await post(command, 409);
  duplicateCallsign = false;
  await post({ ...command, trainNumber: '9999' }, 400);
  await post({ ...command, functionCode: '50' }, 400);
  const registered = (await post(command)).vehicle;
  assert.equal(registered.revision, 1);
  assert.equal(registered.binding.timetableId, timetable.$id);
  assert.equal((await post(command)).vehicle.revision, 1, 'Lost-reply retries are idempotent');
  assert.equal(
    (await post({ type: 'initialize', sensorIds: [sensorId] })).vehicles.find(
      (vehicle: { sensorId: string }) => vehicle.sensorId === sensorId,
    ).binding.driverId,
    '12340',
    'Startup retry preserves a confirmed binding',
  );
  const saved = await db.collection('gsm_r_vehicles').findOne({ sessionId, sensorId });
  assert.deepEqual(saved?.binding, registered.binding);
  await post({ ...command, sensorId: otherSensor }, 409);
  await post({ ...command, functionCode: '02', expectedRevision: 1 }, 409);
  await post({ type: 'deregister', sensorId, actorUserId: '999', expectedRevision: 1 }, 403);
  await post({ type: 'deregister', sensorId, actorUserId: '12340', expectedRevision: 0 }, 409);
  const clear = { type: 'deregister', sensorId, actorUserId: '12340', expectedRevision: 1 };
  assert.equal((await post(clear)).vehicle.binding, null);
  assert.equal((await post(clear)).vehicle.revision, 2);
  await post(command, 409);
  // Competing drivers cannot claim the same train/function, even on another process.
  await post({ ...command, expectedRevision: 2 });
  profile.userId = 'gsmr-qa-driver-two';
  profile.robloxUserId = '999';
  profile.callsign = 'ZSSK-043';
  await db.collection<{ _id: string }>('session_driver_trains').insertOne({
    _id: `${sessionId}-two`,
    ...{
      sessionId,
      userId: profile.userId,
      trainNumber: '5001',
      timetableId: timetable.$id,
      trainType: 'Os',
    },
  });
  await post({ ...command, sensorId: otherSensor, actorUserId: '999', driverId: '043' }, 409);
  // Different locomotive functions may belong to the same timetable train.
  assert.equal(
    (
      await post({
        ...command,
        sensorId: otherSensor,
        actorUserId: '999',
        driverId: '043',
        functionCode: '02',
      })
    ).vehicle.binding.functionCode,
    '02',
  );
  const snapshot = await (await GET(request(), context)).json();
  assert.equal(snapshot.vehicles.filter((v: { binding: unknown }) => v.binding).length, 2);
  console.log('GSM-R HTTP/Mongo verification passed.');
}
async function run() {
  try {
    await verify();
  } finally {
    appwrite.mock.restore();
    const db = await getMongoDb();
    await Promise.all([
      db.collection('gsm_r_vehicles').deleteMany({ sessionId }),
      db.collection('session_driver_trains').deleteMany({ sessionId }),
      db.collection<{ _id: string }>('sessions').deleteOne({ _id: sessionId }),
    ]);
    await (await getMongoClient()).close();
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
