/** Uses a disposable Appwrite database and a unique Mongo universe/session namespace. */
import { Client, Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

async function main() {
  const fixture = `qa_gvd_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  process.env.APPWRITE_DATABASE_ID = fixture;
  const universeId = `${Date.now()}${Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0')}`;
  process.env.ROBLOX_UNIVERSE_ID = universeId;
  const sessionId = randomUUID();
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)
    .setKey(process.env.APPWRITE_API_KEY!);
  const db = new Databases(client);
  let created = false;
  let mongo:
    Awaited<ReturnType<(typeof import('../src/lib/server/mongo'))['getMongoDb']>> | undefined;
  try {
    await db.create({ databaseId: fixture, name: 'Isolated GVD verification' });
    created = true;
    await db.createCollection({
      databaseId: fixture,
      collectionId: 'timetables_gvd',
      name: 'Fixture timetables',
      permissions: [],
      documentSecurity: false,
    });
    for (const [key, size, required] of [
      ['placeId', 32, false],
      ['trainNumber', 32, true],
      ['trainType', 16, true],
      ['routeTitle', 128, true],
      ['stopsJson', 20000, true],
      ['nextTrainId', 36, false],
      ['notes', 1000, false],
      ['conflictDetails', 1000, false],
    ] as const)
      await db.createStringAttribute({
        databaseId: fixture,
        collectionId: 'timetables_gvd',
        key,
        size,
        required,
      });
    for (const key of ['maxSpeed', 'trainLength'])
      await db.createIntegerAttribute({
        databaseId: fixture,
        collectionId: 'timetables_gvd',
        key,
        required: false,
      });
    await db.createBooleanAttribute({
      databaseId: fixture,
      collectionId: 'timetables_gvd',
      key: 'hasConflict',
      required: false,
    });
    async function ready() {
      for (let n = 0; n < 30; n++) {
        const attributes = await db.listAttributes({
          databaseId: fixture,
          collectionId: 'timetables_gvd',
        });
        if (attributes.attributes.every((a) => a.status === 'available')) return;
        await new Promise((r) => setTimeout(r, 1000));
      }
      throw Error('Fixture attributes did not become ready.');
    }
    await ready();
    const { getMongoDb } = await import('../src/lib/server/mongo');
    mongo = await getMongoDb();
    const { newPlanning, estimated750 } = await import('../src/lib/dis/gvd-planning');
    const { getDisUniverseId } = await import('../src/lib/server/dis/places');
    assert.equal(getDisUniverseId(), universeId);
    const placeId = '9000000000000001';
    await mongo.collection('roblox_place_templates').insertOne({
      universeId,
      placeId,
      schema: { stations: [{ stationId: 'A' }, { stationId: 'B' }] },
    });
    const train = {
      trainNumber: '90001',
      trainType: 'Os',
      maxSpeed: 100,
      trainLength: 100,
      stops: [
        { station: 'A', arrival: '08:00', departure: '08:00', track: '1' },
        { station: 'B', arrival: '08:10', departure: '08:10', track: '1' },
      ],
    };
    const legacy = await db.createDocument({
      databaseId: fixture,
      collectionId: 'timetables_gvd',
      documentId: 'legacy',
      data: {
        placeId,
        trainNumber: train.trainNumber,
        trainType: 'Os',
        maxSpeed: 100,
        trainLength: 100,
        routeTitle: 'A – B',
        stopsJson: JSON.stringify(train.stops),
      },
    });
    const { ensureGvdPlanningAttribute } = await import('../src/lib/server/dis/schema');
    const beforeMigration = await import('../src/lib/server/dis/timetables');
    await assert.rejects(
      () =>
        beforeMigration.saveTimetable({
          placeId,
          id: legacy.$id,
          expectedUpdatedAt: legacy.$updatedAt,
          timetable: { ...train, planning: newPlanning() },
        }),
      (error) => error instanceof Error && 'status' in error && error.status === 503,
    );
    await ensureGvdPlanningAttribute();
    await ready();
    await ensureGvdPlanningAttribute();
    const { loadTimetables, saveTimetable, retireTimetable, previewTimetable } =
      await import('../src/lib/server/dis/timetables');
    assert.equal((await loadTimetables(placeId))[0].planning, undefined);
    const { saveLine, loadLines } = await import('../src/lib/server/dis/lines');
    const measuredRoute = {
      id: randomUUID(),
      placeId,
      name: 'Measured fixture',
      stations: ['A', 'B'],
      measuredStops: train.stops,
    };
    await saveLine(measuredRoute);
    assert.deepEqual((await loadLines(placeId))[0].measuredStops, train.stops);
    const { dailyTimetable } = await import('../src/lib/dis/gvd-simple');
    const planning = { ...dailyTimetable(train).planning!, stock: estimated750 };
    const updated = await saveTimetable({
      placeId,
      id: legacy.$id,
      expectedUpdatedAt: legacy.$updatedAt,
      timetable: { ...train, planning },
    });
    assert.equal(updated.timetable.$id, legacy.$id);
    assert.equal((await loadTimetables(placeId))[0].planning?.stock?.locomotiveMassT, 74);
    await assert.rejects(
      () =>
        saveTimetable({
          placeId,
          id: legacy.$id,
          expectedUpdatedAt: legacy.$updatedAt,
          timetable: { ...train, notes: 'stale' },
        }),
      /iný používateľ/,
    );
    const race = await Promise.allSettled(
      ['first', 'second'].map((notes) =>
        saveTimetable({
          placeId,
          id: legacy.$id,
          expectedUpdatedAt: updated.timetable.$updatedAt,
          timetable: { ...updated.timetable, notes },
        }),
      ),
    );
    assert.equal(
      race.filter((r) => r.status === 'fulfilled').length,
      1,
      'Exactly one concurrent Appwrite edit must commit.',
    );
    const winning = (await loadTimetables(placeId))[0];
    await mongo
      .collection('session_driver_trains')
      .insertOne({ sessionId, timetableId: legacy.$id, expiresAt: Date.now() + 60000 });
    await assert.rejects(
      () => retireTimetable({ placeId, id: legacy.$id, expectedUpdatedAt: winning.$updatedAt }),
      /rušňovodič/,
    );
    await mongo.collection('session_driver_trains').deleteMany({ sessionId });
    const retired = await retireTimetable({
      placeId,
      id: legacy.$id,
      expectedUpdatedAt: winning.$updatedAt,
    });
    assert.equal(retired.timetable.$id, legacy.$id);
    assert.equal((await loadTimetables(placeId)).length, 0);
    assert.equal((await loadTimetables(placeId, true)).length, 1);
    await previewTimetable({ placeId, id: legacy.$id, timetable: retired.timetable });
    const { saveStockProfile, loadStockProfiles, deleteStockProfile } =
      await import('../src/lib/server/dis/gvd-profiles');
    await saveStockProfile({ placeId, profile: estimated750 });
    await saveStockProfile({ placeId, profile: { ...estimated750, version: 2 } });
    assert.equal((await loadStockProfiles(placeId)).length, 1);
    assert.equal((await loadTimetables(placeId, true))[0].planning?.stock?.version, 1);
    await deleteStockProfile({ placeId, id: estimated750.id });
    assert.equal((await loadStockProfiles(placeId)).length, 0);
    await mongo.collection('sessions').insertOne({
      _id: sessionId as never,
      status: 'active',
      interpreter: {
        kind: 'roblox',
        universeId,
        placeId,
        heartbeat: { lastHeartbeatAt: new Date().toISOString() },
      },
    });
    const { getSessionClock, setSessionClock } =
      await import('../src/lib/server/dis/session-clock');
    const initialClock = await getSessionClock(sessionId);
    assert.equal(initialClock.clock.offsetMinutes, 0);
    assert.equal(initialClock.clock.configured, false);
    await setSessionClock({ sessionId, offsetMinutes: -720 });
    assert.equal((await getSessionClock(sessionId)).clock.offsetMinutes, -720);
    assert.equal((await getSessionClock(sessionId)).clock.configured, true);
    await assert.rejects(() => setSessionClock({ sessionId, offsetMinutes: 99999 }));
    await assert.rejects(() => getSessionClock('missing-session'));
    const { GET: getClock, POST: postClock } =
      await import('../apps/api/src/app/api/dis/session-clock/route');
    for (const handler of [getClock, postClock])
      assert.equal(
        (
          await handler(
            new Request('http://localhost/api/dis/session-clock?sessionId=' + sessionId),
          )
        ).status,
        401,
      );
    const { saveSessionTimetable, loadOperatingTimetables } =
      await import('../src/lib/server/dis/session-timetables');
    const first = await saveSessionTimetable({
      sessionId,
      timetable: { ...train, trainNumber: '90002', planning },
    });
    assert.ok(first.timetable);
    const second = await saveSessionTimetable({
      sessionId,
      id: first.timetable.$id,
      expectedUpdatedAt: first.timetable.$updatedAt,
      timetable: { ...first.timetable, trainNumber: '90003' },
    });
    assert.equal(second.timetable?.$id, first.timetable.$id);
    await assert.rejects(
      () =>
        saveSessionTimetable({
          sessionId,
          id: first.timetable!.$id,
          expectedUpdatedAt: 'stale',
          timetable: first.timetable,
        }),
      /iný používateľ/,
    );
    assert.equal((await loadOperatingTimetables(sessionId)).length, 1);
    const oldId = randomUUID();
    await mongo.collection('session_timetables').insertOne({
      ...train,
      trainNumber: '90004',
      $id: oldId,
      $updatedAt: new Date().toISOString(),
      sessionId,
    });
    const legacySession = (await loadOperatingTimetables(sessionId)).find((t) => t.$id === oldId);
    assert.ok(legacySession);
    const migratedSession = await saveSessionTimetable({
      sessionId,
      id: oldId,
      expectedUpdatedAt: legacySession.$updatedAt,
      timetable: legacySession,
    });
    assert.equal(migratedSession.timetable?.$id, oldId);
    assert.equal((await loadOperatingTimetables(sessionId)).length, 2);
    const { GET, POST, DELETE } = await import('../apps/api/src/app/api/dis/gvd-profiles/route');
    for (const handler of [GET, POST, DELETE])
      assert.equal(
        (await handler(new Request('http://localhost/api/dis/gvd-profiles?placeId=' + placeId)))
          .status,
        401,
      );
    console.log(
      'PASS: additive migration/idempotence, legacy read, Appwrite transaction/update/retirement/stale protection, profile snapshots, Mongo session rename/CAS, unauthenticated API rejection.',
    );
  } finally {
    // Restrict cleanup to this run's generated names, even on a failed assertion.
    assert.match(fixture, /^qa_gvd_[a-f0-9]{16}$/);
    try {
      if (mongo) {
        await mongo.collection('roblox_place_templates').deleteMany({ universeId });
        await mongo.collection('gvd_stock_profiles').deleteMany({ universeId });
        await mongo.collection('railway_lines').deleteMany({ universeId });
        await mongo.collection('session_clocks').deleteMany({ universeId });
        await mongo.collection('sessions').deleteOne({ _id: sessionId as never });
        await mongo.collection('session_timetables').deleteMany({ sessionId });
        await mongo.collection('session_driver_trains').deleteMany({ sessionId });
        const { getMongoClient } = await import('../src/lib/server/mongo');
        await (await getMongoClient()).close();
      }
    } finally {
      if (created) await db.delete({ databaseId: fixture });
    }
    console.log('Isolated GVD fixtures removed.');
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'GVD persistence verification failed.');
  process.exitCode = 1;
});
