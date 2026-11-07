/** Isolated persistence verification; all Appwrite and Mongo fixtures are removed. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { stateGroups, tiles } from '../src/app/data/tiles';
import type { UserProfile } from '../src/lib/dis/appwrite-client';
import { databaseId, disDatabase, DisError } from '../src/lib/server/dis/appwrite';
import { changeShiftStatus, createShift, loadShifts } from '../src/lib/server/dis/personnel';
import { getDisUniverseId } from '../src/lib/server/dis/places';
import { assignShiftStaff, configureShiftPlan } from '../src/lib/server/dis/shift-planning';
import { saveTimetable } from '../src/lib/server/dis/timetables';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { createInitialStationLayout } from '../src/lib/station/layout';

const tag = `shiftqa${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const placeId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const universeId = getDisUniverseId();
const db = disDatabase();
const created: [string, string][] = [];

async function verify() {
  const mongo = await getMongoDb();
  const now = new Date().toISOString();
  await mongo.collection('roblox_place_templates').insertOne({
    _id: `${universeId}:${placeId}` as never,
    universeId,
    placeId,
    revision: 1,
    createdAt: now,
    updatedAt: now,
    schema: {
      version: 1,
      stations: ['A', 'B'].map((stationId) => ({
        stationId,
        layout: createInitialStationLayout(2, 2, tiles, stateGroups),
      })),
      lineblockLinks: [],
    },
  });
  const staff = (role: UserProfile['role']): UserProfile => ({
    userId: `${tag}-${role}`,
    name: `${tag} ${role}`,
    role,
    callsign: 'QA',
    trainingStage: 'certified',
    strikes: 0,
  });
  for (const role of ['dispatcher', 'driver'] as const) {
    const profile = staff(role);
    await db.createDocument(databaseId, 'profiles', profile.userId, profile);
    created.push(['profiles', profile.userId]);
  }
  const saved = await saveTimetable({
    placeId,
    timetable: {
      trainNumber: tag,
      trainType: 'Os',
      maxSpeed: 100,
      trainLength: 100,
      stops: [
        { station: 'A', arrival: '08:00', departure: '08:01', track: '1' },
        { station: 'B', arrival: '08:15', departure: '08:16', track: '1' },
      ],
    },
  });
  created.push(['timetables_gvd', saved.timetable.$id]);
  const { shift } = await createShift({ title: tag, date: '2026-11-08', startTime: '08:00' });
  created.push(['shifts', shift.$id]);
  assert.equal((await loadShifts(shift.$id)).plan, null, 'Legacy/unplanned shifts remain readable');
  const configured = await configureShiftPlan({
    id: shift.$id,
    placeId,
    timetableIds: [saved.timetable.$id],
  });
  assert.equal(configured.plan.stations.length, 2);
  await assignShiftStaff({
    id: shift.$id,
    role: 'dispatcher',
    targetId: 'A',
    userId: staff('dispatcher').userId,
  });
  await assert.rejects(
    assignShiftStaff({
      id: shift.$id,
      role: 'dispatcher',
      targetId: 'B',
      userId: staff('dispatcher').userId,
    }),
    (error: unknown) => error instanceof DisError && error.status === 409,
  );
  await assert.rejects(
    assignShiftStaff({
      id: shift.$id,
      role: 'dispatcher',
      targetId: 'A',
      userId: staff('driver').userId,
    }),
    (error: unknown) => error instanceof DisError && error.status === 403,
  );
  await assert.rejects(
    assignShiftStaff({
      id: shift.$id,
      role: 'driver',
      targetId: 'missing',
      userId: staff('driver').userId,
    }),
    (error: unknown) => error instanceof DisError && error.status === 400,
  );
  await assignShiftStaff({
    id: shift.$id,
    role: 'driver',
    targetId: saved.timetable.$id,
    userId: staff('driver').userId,
  });
  const persisted = await db.getDocument(databaseId, 'shifts', shift.$id);
  assert.equal(JSON.parse(persisted.planJson).assignments.length, 2);
  assert.equal((await loadShifts(shift.$id)).plan?.assignments.length, 2);
  await saveTimetable({
    placeId,
    id: saved.timetable.$id,
    timetable: { ...saved.timetable, maxSpeed: 90 },
  });
  assert.equal(
    (await loadShifts(shift.$id)).plan?.trains[0].maxSpeed,
    100,
    'GVD changes do not mutate a shift snapshot',
  );
  const updated = await configureShiftPlan({
    id: shift.$id,
    placeId,
    timetableIds: [saved.timetable.$id],
  });
  assert.equal(updated.plan.trains[0].maxSpeed, 90);
  assert.equal(updated.plan.assignments.length, 2, 'Kept targets retain their staff');
  await assignShiftStaff({ id: shift.$id, role: 'dispatcher', targetId: 'A', userId: '' });
  assert.equal((await loadShifts(shift.$id)).plan?.assignments.length, 1);
  await changeShiftStatus({ id: shift.$id, status: 'active' });
  await assert.rejects(
    configureShiftPlan({ id: shift.$id, placeId, timetableIds: [saved.timetable.$id] }),
    (error: unknown) => error instanceof DisError && error.status === 409,
  );
  await assignShiftStaff({
    id: shift.$id,
    role: 'dispatcher',
    targetId: 'B',
    userId: staff('dispatcher').userId,
  });
  await changeShiftStatus({ id: shift.$id, status: 'completed' });
  await assert.rejects(
    assignShiftStaff({ id: shift.$id, role: 'dispatcher', targetId: 'B', userId: '' }),
    (error: unknown) => error instanceof DisError && error.status === 409,
  );
  console.log(
    'Shift planning persistence, role validation, snapshot isolation, removal and status checks passed.',
  );
}

async function main() {
  try {
    await verify();
  } finally {
    for (const [collection, id] of created.reverse())
      await db.deleteDocument(databaseId, collection, id);
    const mongo = await getMongoDb();
    await mongo.collection('roblox_place_templates').deleteOne({ universeId, placeId });
    await (await getMongoClient()).close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
