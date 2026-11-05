/** Isolated integration check. Requires a running app, Appwrite admin credentials and MongoDB. */
import { MongoClient } from 'mongodb';
import { Client, Databases, Query, Storage, Users } from 'node-appwrite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getDisUniverseId } from '../src/lib/server/dis/places';

const base = process.env.DIS_TEST_BASE_URL || 'http://localhost:3101';
const client = new Client()
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT || 'https://appwrite.igportals.eu/v1')
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID || 'jopis')
  .setKey(process.env.APPWRITE_API_KEY || '');
const db = new Databases(client),
  users = new Users(client),
  storage = new Storage(client);
const databaseId = process.env.APPWRITE_DATABASE_ID || 'jop_dis';
const bucketId = process.env.APPWRITE_STORAGE_BUCKET_ID || 'dis_storage';
const tag = `qa${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const testPlace = `${Date.now()}${Math.floor(Math.random() * 1000)
  .toString()
  .padStart(3, '0')}`;
const testUniverse = getDisUniverseId();
const records: [string, string][] = [],
  userIds: string[] = [],
  files: string[] = [];
const mongo = new MongoClient(process.env.MONGODB_URI!);
let sessionId = '';
async function request(path: string, token: string, body?: unknown, status = 200) {
  const response = await fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  assert.equal(response.status, status, `${path}: ${JSON.stringify(result)}`);
  return result;
}
async function account(role: string) {
  const id = `${tag}-${role === 'driver' ? 'driver' : 'manager'}`;
  await users.create({
    userId: id,
    email: `${id}@example.invalid`,
    password: randomUUID(),
    name: 'DIS QA',
  });
  userIds.push(id);
  await db.createDocument(databaseId, 'profiles', id, {
    userId: id,
    name: 'DIS QA',
    callsign: 'QA',
    role,
    trainingStage: 'certified',
    strikes: 0,
  });
  records.push(['profiles', id]);
  const session = await users.createSession({ userId: id });
  return { id, token: (await users.createJWT({ userId: id, sessionId: session.$id })).jwt };
}
async function main() {
  for (const path of ['timetables', 'documents', 'radio', 'staff', 'shifts', 'jop-data'])
    await request(`/api/dis/${path}`, '', undefined, 401);
  const manager = await account('dispatcher_manager'),
    driver = await account('driver');
  const createdSession = await request('/api/sessions/mock', '', {});
  sessionId = createdSession.session._id;
  const stationId = `${tag}-a`,
    otherStation = `${tag}-b`;
  const firstStation = await request('/api/stations', '', { sessionId, stationId }, 201);
  const secondStation = await request(
    '/api/stations',
    '',
    { sessionId, stationId: otherStation },
    201,
  );
  await mongo.connect();
  const database = mongo.db(process.env.MONGODB_DB_NAME || 'jop');
  const now = new Date().toISOString();
  await database
    .collection('roblox_place_templates')
    .insertOne({
      _id: `${testUniverse}:${testPlace}` as never,
      universeId: testUniverse,
      placeId: testPlace,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      schema: {
        version: 1,
        stations: [firstStation.station, secondStation.station].map(
          (station: { stationId: string; layout: unknown }) => ({
            stationId: station.stationId,
            layout: station.layout,
          }),
        ),
        lineblockLinks: [],
      },
    });
  await database
    .collection('sessions')
    .updateOne(
      { _id: sessionId as never },
      {
        $set: {
          interpreter: {
            kind: 'roblox',
            universeId: testUniverse,
            placeId: testPlace,
            serverId: tag,
            heartbeat: { lastHeartbeatAt: now },
          },
        },
      },
    );
  const scope = { sessionId, stationId };
  const schedule = {
    trainNumber: `${tag}-1`,
    trainType: 'Os',
    maxSpeed: 120,
    trainLength: 250,
    stops: [
      { station: stationId, arrival: '23:55', departure: '00:05', track: '1' },
      { station: otherStation, arrival: '00:20', departure: '00:21', track: '1' },
    ],
  };
  await request(
    '/api/dis/timetables',
    driver.token,
    { placeId: testPlace, timetable: schedule },
    403,
  );
  const saved = await request('/api/dis/timetables', manager.token, {
    placeId: testPlace,
    timetable: schedule,
  });
  records.push(['timetables_gvd', saved.timetable.$id]);
  const peer = {
    ...schedule,
    trainNumber: `${tag}-2`,
    stops: [
      { station: stationId, arrival: '00:01', departure: '00:04', track: '1' },
      { station: otherStation, arrival: '00:30', departure: '00:31', track: '2' },
    ],
  };
  const second = await request('/api/dis/timetables', manager.token, {
    placeId: testPlace,
    timetable: peer,
  });
  records.push(['timetables_gvd', second.timetable.$id]);
  assert(second.report.conflicts.length > 0);
  assert.equal(
    (await db.getDocument(databaseId, 'timetables_gvd', second.timetable.$id)).hasConflict,
    true,
  );
  const imported = await request('/api/dis/edd', manager.token, {
    command: 'import',
    ...scope,
    timetableId: saved.timetable.$id,
  });
  assert.equal(imported.imported, 1);
  assert.equal(
    (
      await request('/api/dis/edd', manager.token, {
        command: 'import',
        ...scope,
        timetableId: saved.timetable.$id,
      })
    ).imported,
    0,
  );
  const edd = await request(`/api/dis/edd?${new URLSearchParams(scope)}`, manager.token);
  const record = edd.records[0];
  await request(
    '/api/dis/edd',
    manager.token,
    { command: 'record', ...scope, id: record.$id, event: 'departure' },
    409,
  );
  await request(
    '/api/dis/edd',
    driver.token,
    { command: 'record', ...scope, id: record.$id, event: 'arrival' },
    403,
  );
  await request('/api/dis/edd', manager.token, {
    command: 'record',
    ...scope,
    id: record.$id,
    event: 'arrival',
  });
  assert.equal((await db.getDocument(databaseId, 'edd_records', record.$id)).status, 'arrived');
  await request('/api/dis/edd', manager.token, {
    command: 'record',
    ...scope,
    id: record.$id,
    event: 'departure',
  });
  assert.equal((await db.getDocument(databaseId, 'edd_records', record.$id)).status, 'departed');
  const draft = await request('/api/dis/documents', manager.token, {
    title: tag,
    category: 'qa',
    contentMarkdown: '# QA',
    isPublished: false,
  });
  records.push(['documents', draft.document.$id]);
  assert(
    !(await request('/api/dis/documents', driver.token)).documents.some(
      (item: { $id: string }) => item.$id === draft.document.$id,
    ),
  );
  await request('/api/dis/documents', manager.token, {
    id: draft.document.$id,
    title: tag,
    category: 'qa',
    contentMarkdown: '# QA published',
    isPublished: true,
  });
  assert(
    (await request('/api/dis/documents', driver.token)).documents.some(
      (item: { $id: string }) => item.$id === draft.document.$id,
    ),
  );
  const form = new FormData();
  form.set(
    'file',
    new File(
      [
        Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=',
          'base64',
        ),
      ],
      'qa.png',
      { type: 'image/png' },
    ),
  );
  const upload = await request('/api/dis/upload', manager.token, form);
  const fileId = upload.url.split('/').at(-1)!;
  files.push(fileId);
  await request(upload.url, '', undefined, 401);
  const attachment = await fetch(`${base}${upload.url}`, {
    headers: { Authorization: `Bearer ${driver.token}` },
  });
  assert.equal(attachment.status, 200);
  assert.equal(attachment.headers.get('content-type'), 'image/png');
  const radio = await request('/api/dis/radio', driver.token, {
    ...scope,
    targetRecipient: 'QA only',
    content: 'QA isolated session',
    isUrgentOrder: true,
  });
  assert.equal(radio.message.isUrgentOrder, false);
  await request(
    '/api/dis/shifts',
    driver.token,
    { command: 'create', title: tag, date: '2026-11-05', startTime: '23:00' },
    403,
  );
  const shift = await request('/api/dis/shifts', manager.token, {
    command: 'create',
    title: tag,
    date: '2026-11-05',
    startTime: '23:00',
  });
  records.push(['shifts', shift.shift.$id]);
  assert.equal(shift.shift.endTime, '01:30');
  const bookingInput = {
    command: 'register',
    shiftId: shift.shift.$id,
    assignedRole: 'driver',
    assignedLocation: 'QA',
  };
  const booking = await request('/api/dis/shifts', driver.token, bookingInput);
  records.push(['shift_bookings', booking.booking.$id]);
  await request('/api/dis/shifts', driver.token, bookingInput, 409);
  await request('/api/dis/shifts', manager.token, {
    command: 'attendance',
    id: booking.booking.$id,
    attendance: 'present',
  });
  await request('/api/dis/shifts', manager.token, {
    command: 'status',
    id: shift.shift.$id,
    status: 'active',
  });
  await request('/api/dis/shifts', manager.token, {
    command: 'status',
    id: shift.shift.$id,
    status: 'completed',
  });
  await request('/api/dis/staff', driver.token, undefined, 403);
  await request('/api/dis/staff', manager.token, {
    id: driver.id,
    trainingStage: 'exam',
    strikes: 1,
    notes: 'QA',
    role: 'admin',
  });
  assert.equal((await db.getDocument(databaseId, 'profiles', driver.id)).role, 'driver');
  console.log(
    'PASS: authentication, role checks, GVD conflicts, idempotent EDD import and transitions, document publication, attachments, scoped radio, shifts, attendance and staff assessment.',
  );
}
async function cleanup() {
  const failures: unknown[] = [];
  const attempt = async (operation: () => Promise<unknown>) => {
    try {
      await operation();
    } catch (error) {
      failures.push(error);
    }
  };
  if (sessionId) {
    for (const collection of ['edd_records', 'radio_messages']) {
      const result = await db.listDocuments(databaseId, collection, [
        Query.equal('sessionId', sessionId),
        Query.limit(100),
      ]);
      for (const record of result.documents)
        await attempt(() => db.deleteDocument(databaseId, collection, record.$id));
    }
    await attempt(async () => {
      await mongo.connect();
      const database = mongo.db(process.env.MONGODB_DB_NAME || 'jop');
      for (const collection of ['stations', 'station_actions', 'sessions'])
        await database
          .collection(collection)
          .deleteMany(collection === 'sessions' ? { _id: sessionId as never } : { sessionId });
    });
  }
  for (const file of files) await attempt(() => storage.deleteFile(bucketId, file));
  for (const [collection, id] of records.reverse())
    await attempt(() => db.deleteDocument(databaseId, collection, id));
  for (const id of userIds) await attempt(() => users.delete(id));
  await attempt(async () => {
    await mongo.connect();
    await mongo
      .db(process.env.MONGODB_DB_NAME || 'jop')
      .collection('roblox_place_templates')
      .deleteMany({ universeId: testUniverse, placeId: testPlace });
  });
  await mongo.close();
  if (failures.length) throw new AggregateError(failures, 'DIS QA cleanup failed');
  console.log('All isolated QA records, users, files and Mongo session removed.');
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
