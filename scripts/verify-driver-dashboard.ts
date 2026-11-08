/** Driver metadata and GVD integration using isolated Appwrite/Mongo fixtures. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { stateGroups, tiles } from '../src/app/data/tiles';
import type { UserProfile } from '../src/lib/dis/appwrite-client';
import { databaseId, disDatabase, DisError } from '../src/lib/server/dis/appwrite';
import {
  finishDriverTrain,
  loadDriverDashboard,
  saveDriverTrain,
} from '../src/lib/server/dis/driver-train';
import { getDisUniverseId, loadDisPlaces } from '../src/lib/server/dis/places';
import { loadTimetables, saveTimetable } from '../src/lib/server/dis/timetables';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { stationService } from '../src/lib/server/services/station-service';
import { createInitialStationLayout } from '../src/lib/station/layout';

const tag = `driverqa${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const placeId = String(Date.now());
const universeId = getDisUniverseId();
const driver: UserProfile = {
  userId: tag,
  name: tag,
  role: 'driver',
  callsign: 'QA',
  trainingStage: 'certified',
  strikes: 0,
};
const created: string[] = [];
let sessionId = '';

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
      stations: ['a', 'b', 'inter'].map((stationId) => ({
        stationId,
        layout: createInitialStationLayout(2, 2, tiles, stateGroups),
      })),
      lineblockLinks: [],
    },
  });
  const session = await stationService.createMockSession();
  sessionId = session._id;
  await mongo.collection('sessions').updateOne(
    { _id: sessionId as never },
    {
      $set: {
        interpreter: {
          kind: 'roblox',
          universeId,
          placeId,
          serverId: sessionId,
          heartbeat: { lastHeartbeatAt: now },
        },
      },
    },
  );
  for (const station of ['a', 'b', 'inter'])
    await stationService.ensureStation(sessionId, station, undefined, true);
  const timetable = {
    trainNumber: `${tag}-1`,
    trainType: 'Os',
    maxSpeed: 100,
    trainLength: 150,
    notes: 'Train notes',
    stops: [
      { station: 'a', arrival: '08:00', departure: '08:01', track: '1', notes: 'Stop note' },
      { station: 'b', arrival: '08:20', departure: '08:20', track: '' },
    ],
  };
  const first = await saveTimetable({ placeId, timetable });
  created.push(first.timetable.$id);
  const second = await saveTimetable({
    placeId,
    timetable: {
      ...timetable,
      trainNumber: `${tag}-2`,
      stops: [...timetable.stops].reverse().map((stop, index) => ({
        ...stop,
        arrival: index ? '09:00' : '08:40',
        departure: index ? '09:00' : '08:40',
      })),
    },
  });
  created.push(second.timetable.$id);
  await saveTimetable({
    placeId,
    id: first.timetable.$id,
    timetable: { ...first.timetable, nextTrainId: second.timetable.$id },
  });
  const loaded = (await loadTimetables(placeId)).find(
    (train) => train.$id === first.timetable.$id,
  )!;
  assert.equal(loaded.nextTrainId, second.timetable.$id);
  assert.equal(loaded.stops[0].notes, 'Stop note');
  await assert.rejects(
    saveTimetable({
      placeId,
      id: first.timetable.$id,
      timetable: { ...loaded, nextTrainId: loaded.$id },
    }),
    (error: unknown) => error instanceof DisError && error.status === 400,
  );
  await assert.rejects(
    saveTimetable({
      placeId,
      id: first.timetable.$id,
      timetable: { ...loaded, nextTrainId: 'foreign-train' },
    }),
    (error: unknown) => error instanceof DisError && error.status === 400,
  );
  await assert.rejects(
    saveTimetable({
      placeId,
      timetable: {
        ...timetable,
        trainNumber: 'hidden',
        stops: [{ ...timetable.stops[0], station: 'inter' }, timetable.stops[1]],
      },
    }),
    (error: unknown) => error instanceof DisError && error.status === 400,
  );
  const command = {
    sessionId,
    trainNumber: timetable.trainNumber,
    trainType: 'Pos',
    timetableId: loaded.$id,
    endStation: 'b',
    length: 145,
    tonnage: 320.5,
    wagons: 12,
  };
  await saveDriverTrain(command, driver);
  const persisted = await mongo
    .collection('session_driver_trains')
    .findOne({ sessionId, userId: driver.userId });
  assert.equal(persisted?.trainType, 'Pos');
  assert.equal(persisted?.wagons, 12);
  const dashboard = await loadDriverDashboard(sessionId, driver);
  assert.equal(dashboard.train?.timetableId, loaded.$id);
  assert(!dashboard.stations.some((station) => station.stationId === 'inter'));
  assert(
    (await stationService.getStation(sessionId, 'inter'))?.stationId === 'inter',
    'Direct debug access remains valid',
  );
  assert(
    !(await loadDisPlaces()).places
      .find((place) => place.placeId === placeId)
      ?.stations.some((station) => station.stationId === 'inter'),
  );
  await assert.rejects(
    saveDriverTrain({ ...command, trainNumber: 'wrong' }, driver),
    (error: unknown) => error instanceof DisError && error.status === 400,
  );
  await assert.rejects(
    saveDriverTrain(command, { ...driver, role: 'dispatcher' }),
    (error: unknown) => error instanceof DisError && error.status === 403,
  );
  await saveDriverTrain(
    { ...command, timetableId: null, trainNumber: 'CUSTOM-1', trainType: 'Pn' },
    driver,
  );
  assert.equal((await loadDriverDashboard(sessionId, driver)).train?.timetableId, null);
  assert.equal(
    await mongo
      .collection('session_driver_trains')
      .countDocuments({ sessionId, userId: driver.userId }),
    1,
    'Changes replace the current selection',
  );
  const unchangedSession = await mongo.collection('sessions').findOne({ _id: sessionId as never });
  assert.deepEqual(
    unchangedSession?.runtime.trains,
    {},
    'Driver selections do not create/move runtime trains',
  );
  await finishDriverTrain(sessionId, driver);
  assert.equal((await loadDriverDashboard(sessionId, driver)).train, null);
  console.log(
    'Driver train persistence, Pos/category override, custom numbers, next legs, notes, hidden stations and runtime isolation passed.',
  );
}
async function main() {
  try {
    await verify();
  } finally {
    for (const id of created) await disDatabase().deleteDocument(databaseId, 'timetables_gvd', id);
    const mongo = await getMongoDb();
    for (const collection of [
      'stations',
      'station_actions',
      'session_driver_trains',
      'roblox_runtime_state',
      'roblox_runtime_updates',
    ])
      await mongo.collection(collection).deleteMany({ sessionId });
    if (sessionId) await mongo.collection('sessions').deleteOne({ _id: sessionId as never });
    await mongo.collection('roblox_place_templates').deleteOne({ universeId, placeId });
    await (await getMongoClient()).close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
