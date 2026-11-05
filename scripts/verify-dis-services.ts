/** Persistence checks without the Appwrite Users service. All fixtures are isolated and removed. */
import { Query } from 'node-appwrite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { UserProfile } from '../src/lib/dis/appwrite-client';
import { databaseId, disDatabase } from '../src/lib/server/dis/appwrite';
import {
  loadDisDocuments,
  loadRadio,
  saveDisDocument,
  sendRadio,
} from '../src/lib/server/dis/content';
import { createEdd, importTimetable, listEdd, recordEddEvent } from '../src/lib/server/dis/edd';
import {
  assessStaff,
  changeShiftStatus,
  createShift,
  recordAttendance,
  registerShift,
} from '../src/lib/server/dis/personnel';
import { getDisUniverseId } from '../src/lib/server/dis/places';
import { loadTimetables, previewTimetable, saveTimetable } from '../src/lib/server/dis/timetables';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { stationService } from '../src/lib/server/services/station-service';

const tag = `qa${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const testPlace = `${Date.now()}${Math.floor(Math.random() * 1000)
  .toString()
  .padStart(3, '0')}`;
const secondPlace = String(BigInt(testPlace) + 1n);
const testUniverse = getDisUniverseId();
const manager: UserProfile = {
  userId: `${tag}-manager`,
  name: 'DIS QA',
  callsign: 'QA',
  role: 'dispatcher_manager',
  trainingStage: 'certified',
  strikes: 0,
};
const driver: UserProfile = { ...manager, userId: `${tag}-driver`, role: 'driver' };
const created: [string, string][] = [];
let sessionId = '';
const db = disDatabase();
async function verify() {
  const profile = await db.createDocument(databaseId, 'profiles', driver.userId, driver);
  created.push(['profiles', profile.$id]);
  const session = await stationService.createMockSession();
  sessionId = session._id;
  const stationId = `${tag}-a`,
    remote = `${tag}-b`;
  const initialStation = await stationService.createStation(sessionId, stationId);
  const remoteStation = await stationService.createStation(sessionId, remote);
  const mongo = await getMongoDb();
  for (const placeId of [testPlace, secondPlace]) {
    const now = new Date().toISOString();
    await mongo.collection('roblox_place_templates').insertOne({
      _id: `${testUniverse}:${placeId}` as never,
      universeId: testUniverse,
      placeId,
      revision: 1,
      createdAt: now,
      updatedAt: now,
      schema: {
        version: 1,
        stations: [
          { stationId, layout: initialStation.layout },
          { stationId: remote, layout: remoteStation.layout },
        ],
        lineblockLinks: [],
      },
    });
  }
  await mongo
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
            heartbeat: { lastHeartbeatAt: new Date().toISOString() },
          },
        },
      },
    );
  const scope = { sessionId, stationId };
  const timetable = {
    trainNumber: `${tag}-1`,
    trainType: 'Os',
    maxSpeed: 120,
    trainLength: 250,
    stops: [
      { station: stationId, arrival: '23:55', departure: '00:05', track: '1' },
      { station: remote, arrival: '00:20', departure: '00:21', track: '1' },
    ],
  };
  const first = await saveTimetable({ placeId: testPlace, timetable });
  created.push(['timetables_gvd', first.timetable.$id]);
  const second = await saveTimetable({
    placeId: testPlace,
    timetable: {
      ...timetable,
      trainNumber: `${tag}-2`,
      stops: [
        { station: stationId, arrival: '00:01', departure: '00:04', track: '1' },
        { station: remote, arrival: '00:30', departure: '00:31', track: '2' },
      ],
    },
  });
  created.push(['timetables_gvd', second.timetable.$id]);
  assert(second.report.conflicts.length > 0);
  assert.equal(
    (await db.getDocument(databaseId, 'timetables_gvd', second.timetable.$id)).hasConflict,
    true,
  );
  assert(
    (await previewTimetable({ placeId: testPlace, id: first.timetable.$id, timetable })).report
      .conflicts.length > 0,
  );
  const otherPlaceTrain = await saveTimetable({ placeId: secondPlace, timetable });
  created.push(['timetables_gvd', otherPlaceTrain.timetable.$id]);
  assert.equal(otherPlaceTrain.report.conflicts.length, 0);
  assert.equal(
    (await loadTimetables(testPlace)).some((entry) => entry.$id === otherPlaceTrain.timetable.$id),
    false,
  );
  await assert.rejects(
    saveTimetable({ placeId: secondPlace, id: first.timetable.$id, timetable }),
    /nepatrí/,
  );
  await assert.rejects(
    importTimetable({ ...scope, timetableId: otherPlaceTrain.timetable.$id }, manager),
    /neexistuje/,
  );
  assert.equal(
    (await importTimetable({ ...scope, timetableId: first.timetable.$id }, manager)).imported,
    1,
  );
  assert.equal(
    (await importTimetable({ ...scope, timetableId: first.timetable.$id }, manager)).imported,
    0,
  );
  const [edd] = await listEdd(scope);
  await assert.rejects(
    recordEddEvent({ ...scope, id: edd.$id, event: 'departure' }, manager),
    /nebol|nezodpovedá|vykonaný/,
  );
  await recordEddEvent({ ...scope, id: edd.$id, event: 'arrival' }, manager);
  assert.equal((await db.getDocument(databaseId, 'edd_records', edd.$id)).status, 'arrived');
  await recordEddEvent({ ...scope, id: edd.$id, event: 'departure' }, manager);
  assert.equal((await db.getDocument(databaseId, 'edd_records', edd.$id)).status, 'departed');
  const extra = await createEdd(
    {
      ...scope,
      trainNumber: `${tag}-extra`,
      trainType: 'Pn',
      schedArrival: '08:00',
      schedDeparture: '08:05',
      track: '2',
    },
    manager,
  );
  assert.equal(extra.record.status, 'scheduled');
  const draft = await saveDisDocument(
    { title: tag, category: 'qa', contentMarkdown: '# QA', isPublished: false },
    manager,
  );
  created.push(['documents', draft.document.$id]);
  assert(!(await loadDisDocuments(false)).some((document) => document.$id === draft.document.$id));
  await saveDisDocument(
    {
      id: draft.document.$id,
      title: tag,
      category: 'qa',
      contentMarkdown: '# Published QA',
      isPublished: true,
    },
    manager,
  );
  assert((await loadDisDocuments(false)).some((document) => document.$id === draft.document.$id));
  await sendRadio(
    { ...scope, targetRecipient: 'QA only', content: 'Isolated verification', isUrgentOrder: true },
    driver,
  );
  assert.equal((await loadRadio(sessionId))[0].isUrgentOrder, false);
  const shift = await createShift({ title: tag, date: '2026-11-05', startTime: '23:00' });
  created.push(['shifts', shift.shift.$id]);
  assert.equal(shift.shift.endTime, '01:30');
  await assert.rejects(
    registerShift(
      { shiftId: shift.shift.$id, assignedRole: 'dispatcher', assignedLocation: 'QA' },
      driver,
    ),
    /oprávnenie/,
  );
  const bookingInput = { shiftId: shift.shift.$id, assignedRole: 'driver', assignedLocation: 'QA' };
  const booking = await registerShift(bookingInput, driver);
  created.push(['shift_bookings', booking.booking.$id]);
  await assert.rejects(registerShift(bookingInput, driver));
  await recordAttendance({ id: booking.booking.$id, attendance: 'present' });
  assert.equal(
    (await db.getDocument(databaseId, 'shift_bookings', booking.booking.$id)).attendance,
    'present',
  );
  await changeShiftStatus({ id: shift.shift.$id, status: 'active' });
  await changeShiftStatus({ id: shift.shift.$id, status: 'completed' });
  await assert.rejects(registerShift(bookingInput, driver), /uzavreté/);
  await assessStaff({
    id: profile.$id,
    trainingStage: 'exam',
    strikes: 1,
    notes: 'QA',
    role: 'admin',
  });
  assert.equal((await db.getDocument(databaseId, 'profiles', profile.$id)).role, 'driver');
  const station = await (
    await getMongoDb()
  )
    .collection('stations')
    .findOne({ sessionId, stationId });
  assert.equal(
    station?.revision,
    initialStation.revision,
    'DIS diary must not change railway runtime state',
  );
  console.log(
    'PASS: persisted GVD conflicts, EDD import and transitions, published documents, scoped radio, shifts, attendance, staff assessment; Mongo runtime unchanged.',
  );
}
async function cleanup() {
  const failures: unknown[] = [];
  async function attempt(operation: () => Promise<unknown>) {
    try {
      await operation();
    } catch (error) {
      failures.push(error);
    }
  }
  if (sessionId) {
    for (const collection of ['edd_records', 'radio_messages']) {
      const result = await db.listDocuments(databaseId, collection, [
        Query.equal('sessionId', sessionId),
        Query.limit(100),
      ]);
      for (const document of result.documents)
        await attempt(() => db.deleteDocument(databaseId, collection, document.$id));
    }
    const mongo = await getMongoDb();
    for (const collection of ['stations', 'station_actions', 'sessions'])
      await attempt(() =>
        mongo
          .collection(collection)
          .deleteMany(collection === 'sessions' ? { _id: sessionId as never } : { sessionId }),
      );
  }
  const mongo = await getMongoDb();
  await attempt(() =>
    mongo
      .collection('roblox_place_templates')
      .deleteMany({ universeId: testUniverse, placeId: { $in: [testPlace, secondPlace] } }),
  );
  for (const [collection, id] of created.reverse())
    await attempt(() => db.deleteDocument(databaseId, collection, id));
  await (await getMongoClient()).close();
  if (failures.length) throw new AggregateError(failures, 'Fixture cleanup failed');
  console.log('Isolated DIS documents and Mongo session removed.');
}
verify()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(cleanup);
