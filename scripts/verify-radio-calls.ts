/** Real Mongo leases, physical location and Roblox HTTP commands; isolated temporary collections. */
import { Db, type CollectionOptions } from 'mongodb';
import { Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import type { UserProfile } from '../src/lib/dis/appwrite-client';
import type { RadioEmit } from '../src/lib/server/dis/radio-calls';
import type { SessionDocument } from '../src/lib/station/domain';

const collectionPrefix = `radio_qa_${randomUUID().replaceAll('-', '')}_`;
process.env.ROBLOX_INBOUND_SECRET = randomUUID();
async function run() {
  const { getMongoClient, getMongoDb } = await import('../src/lib/server/mongo');
  const { sessionDocumentSchema } = await import('../src/lib/station/domain');
  const { GET, POST } = await import('../src/app/api/roblox/sessions/[sessionId]/gsm-r/route');
  const { getDisUniverseId } = await import('../src/lib/server/dis/places');
  const { RadioCalls } = await import('../src/lib/server/dis/radio-calls');
  const { driverRadioStation } = await import('../src/lib/server/dis/radio-location');
  const { radioTerminalRepository: store } =
    await import('../src/lib/server/repositories/radio-terminal-repository');
  const { gsmRRepository } = await import('../src/lib/server/repositories/gsm-r-repository');
  const { loadRadioZones } = await import('../src/lib/server/repositories/radio-zone-repository');
  const db = await getMongoDb();
  const collectionNames = new Set<string>();
  const originalCollection = Db.prototype.collection;
  const collectionMock = mock.method(
    Db.prototype,
    'collection',
    function (this: Db, name: string, options?: CollectionOptions) {
      const isolatedName = collectionPrefix + name;
      collectionNames.add(isolatedName);
      return originalCollection.call(this, isolatedName, options);
    },
  );
  const sessionId = `radio-${randomUUID()}`,
    driver = randomUUID(),
    dispatcher = randomUUID();
  const sensorId = randomUUID(),
    universeId = getDisUniverseId(),
    placeId = '12345';
  const context = { params: Promise.resolve({ sessionId }) };
  const request = (body?: unknown, authorized = true) =>
    new Request('https://example.test/radio', {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: authorized ? `Bearer ${process.env.ROBLOX_INBOUND_SECRET}` : '',
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  const post = async (body: unknown, status = 200) => {
    const response = await POST(request(body), context),
      payload = await response.json();
    assert.equal(response.status, status, JSON.stringify(payload));
    return payload;
  };
  const radio = new RadioCalls({
    store,
    currentStation: driverRadioStation,
    emit: (() => {}) as RadioEmit,
    media: {
      async credentials(id) {
        return { id, token: 'fixture', url: 'wss://example.test' };
      },
      async close() {},
      async remove() {},
    },
    async resolveContact(_session, endpoint) {
      return { ...endpoint, name: endpoint.id };
    },
  });
  try {
    await db.collection<SessionDocument>('sessions').insertOne(
      sessionDocumentSchema.parse({
        _id: sessionId,
        status: 'active',
        mockMode: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        interpreter: {
          kind: 'roblox',
          universeId,
          placeId,
          serverId: sessionId,
          heartbeat: { lastHeartbeatAt: new Date().toISOString() },
        },
        topology: { lineblockLinks: {} },
        runtime: {
          trains: {},
          lineblocks: {},
          physicalOccupations: {
            a: {
              stationId: 'kolarovo',
              pieceId: 'track',
              occupied: true,
              traversalState: 'occupied',
              vehicles: [{ sensorId, distanceToFront: 0 }],
              observedAt: new Date().toISOString(),
              eventId: randomUUID(),
            },
          },
        },
      }),
    );
    await db
      .collection<{ _id: string; sessionId: string; stationId: string }>('stations')
      .insertMany(
        ['kolarovo', 'vesele', 'inter'].map((stationId) => ({
          _id: randomUUID(),
          sessionId,
          stationId,
        })),
      );
    const zones = await loadRadioZones(universeId, placeId, ['vesele', 'inter', 'kolarovo']);
    assert.equal(zones.get('inter'), '00');
    assert.equal(zones.get('kolarovo'), 'K1');
    assert.equal(zones.get('vesele'), 'V1');
    const zonesAgain = await loadRadioZones(universeId, placeId, ['kolarovo', 'komarno']);
    assert.equal(zonesAgain.get('kolarovo'), 'K1');
    assert.equal(zonesAgain.get('komarno'), 'K2');
    await gsmRRepository.initialize(sessionId, [sensorId]);
    await gsmRRepository.setBinding((await gsmRRepository.list(sessionId))[0], {
      userId: driver,
      driverId: '12340',
      driverCallsign: '042',
      trainNumber: '5001',
      trainType: 'Os',
      timetableId: null,
      functionCode: '01',
    });
    const action = {
      type: 'radio-action',
      sensorId,
      actorUserId: '12340',
      action: 'call-dispatcher',
      commandId: randomUUID(),
    };
    assert.equal((await POST(request(action, false), context)).status, 401);
    await post(action, 409);
    await radio.claim(driver, 'driver-owner', {
      sessionId,
      endpoint: { kind: 'driver', id: driver, name: 'Os 5001' },
    });
    await radio.claim(dispatcher, 'station-owner', {
      sessionId,
      endpoint: { kind: 'station', id: 'kolarovo', name: 'Kolárovo' },
    });
    await post({ ...action, actorUserId: '12341' }, 403);
    assert.equal(await driverRadioStation(sessionId, driver), 'kolarovo');
    await post(action);
    await post(action);
    assert.equal(await db.collection('radio_control_commands').countDocuments(), 1);
    await post({ ...action, action: 'emergency-session' }, 409);
    const queued = await store.takeCommands();
    assert.equal(queued.length, 1);
    await radio.robloxAction(queued[0].userId, queued[0].sessionId, queued[0].action);
    await store.finishCommand(queued[0]._id);
    assert.equal((await store.takeCommands()).length, 0);
    const response = await GET(request(), context);
    let snapshot = await response.json();
    assert.equal(response.status, 200);
    assert.equal(snapshot.vehicles[0].communication.zone, 'K1');
    assert.equal(snapshot.vehicles[0].communication.browserConnected, true);
    assert.equal(snapshot.vehicles[0].communication.call.phase, 'ringing');
    await radio.accept(dispatcher, 'station-owner');
    snapshot = await (await GET(request(), context)).json();
    assert.equal(snapshot.vehicles[0].communication.call.phase, 'connected');
    await radio.robloxAction(driver, sessionId, 'emergency-station');
    snapshot = await (await GET(request(), context)).json();
    assert.equal(snapshot.vehicles[0].communication.call, null);
    assert.equal(snapshot.vehicles[0].communication.outgoingEmergency.scope, 'station');
    // Leaving the station changes zone/routing, without removing captured emergency listeners.
    await db
      .collection<SessionDocument>('sessions')
      .updateOne(
        { _id: sessionId },
        { $set: { 'runtime.physicalOccupations.a.stationId': 'inter' } },
      );
    snapshot = await (await GET(request(), context)).json();
    assert.equal(snapshot.vehicles[0].communication.zone, '00');
    assert.equal(await driverRadioStation(sessionId, driver), null);
    await radio.robloxAction(driver, sessionId, 'emergency-stop');
    await assert.rejects(radio.robloxAction(driver, sessionId, 'call-dispatcher'), /Poloha/);
    await radio.release(driver, 'driver-owner');
    await post({ ...action, commandId: randomUUID() }, 409);
    // Communication lists only eligible drivers with a selection in this session.
    const { loadChat } = await import('../src/lib/server/dis/chat');
    const staff = [
      { userId: driver, name: 'Selected driver', role: 'driver', callsign: 'ZSSK-042' },
      { userId: 'unselected', name: 'No train', role: 'driver', callsign: 'ZSSK-043' },
      { userId: 'elsewhere', name: 'Other session', role: 'driver', callsign: 'ZSSK-044' },
      { userId: dispatcher, name: 'Dispatcher', role: 'dispatcher', callsign: 'ZSSK-045' },
    ];
    const appwrite = mock.method(Databases.prototype, 'listDocuments', async () => ({
      documents: staff.map((person) => ({ ...person, $id: person.userId })),
      total: staff.length,
    }));
    try {
      const scope = { sessionId, endpoint: { kind: 'station', id: 'kolarovo' } };
      const operator = staff[3] as UserProfile;
      const contacts = async () =>
        (await loadChat(scope, operator)).contacts
          .filter((contact) => contact.kind === 'driver')
          .map((contact) => contact.id);
      assert.deepEqual(await contacts(), []);
      await db.collection('session_driver_trains').insertMany([
        { sessionId, userId: driver, trainNumber: '5001' },
        { sessionId: 'another-session', userId: 'elsewhere', trainNumber: '5002' },
        { sessionId, userId: dispatcher, trainNumber: '5003' },
        { sessionId, userId: 'orphan-profile', trainNumber: '5004' },
      ]);
      assert.deepEqual(await contacts(), [driver]);
      await db.collection('session_driver_trains').deleteOne({ sessionId, userId: driver });
      assert.deepEqual(await contacts(), []);
    } finally {
      appwrite.mock.restore();
    }
    // The Mongo compare-and-set, independent of the service's memory, arbitrates racing tabs.
    const now = Date.now(),
      raceUser = randomUUID();
    const base = {
      ownerSocketId: 'one',
      sessionId,
      endpoint: { kind: 'driver' as const, id: raceUser },
      expiresAt: now + 20000,
      call: null,
      emergencies: [],
      notice: '',
    };
    const claims = await Promise.all([
      store.claim(raceUser, base, now),
      store.claim(raceUser, { ...base, ownerSocketId: 'two' }, now),
    ]);
    assert.equal(claims.filter(Boolean).length, 1);
    const winner = (await store.find(raceUser))!.ownerSocketId!;
    const staleWrite = await store.save(raceUser, winner === 'one' ? 'two' : 'one', {
      ...base,
      notice: 'stale',
    });
    assert.equal(staleWrite.matchedCount, 0);
    assert(await store.claim(raceUser, { ...base, ownerSocketId: 'after-expiry' }, now + 20001));
    console.log(
      'Radio HTTP/Mongo verification passed: isolated leases, command idempotency, two-way state, station routing and persistent zones.',
    );
  } finally {
    await radio.stop();
    collectionMock.mock.restore();
    try {
      for (const name of collectionNames)
        await db
          .collection(name)
          .drop()
          .catch((error) => {
            if (error.code !== 26) throw error;
          });
    } finally {
      await (await getMongoClient()).close();
    }
  }
}
void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
