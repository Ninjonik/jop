/** Isolated Mongo/Appwrite-read integration check for the operating workspace. */
import { Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';
import type { UserProfile } from '../src/lib/dis/appwrite-client';
import {
  claimStation,
  listStationClaims,
  releaseStation,
  renewOperationClaims,
  requireStationClaim,
} from '../src/lib/server/dis/claims';
import {
  finishDriverTrain,
  loadDriverDashboard,
  saveDriverTrain,
} from '../src/lib/server/dis/driver-train';
import { deleteLine, loadLines, saveLine } from '../src/lib/server/dis/lines';
import { getDisUniverseId } from '../src/lib/server/dis/places';
import {
  loadOperatingTimetables,
  saveSessionTimetable,
} from '../src/lib/server/dis/session-timetables';
import { authorizeStationCommand } from '../src/lib/server/dis/station-command';
import { changeReminder, loadReminders } from '../src/lib/server/dis/station-reminders';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { stationService } from '../src/lib/server/services/station-service';

const tag = `qa-update-${randomUUID().slice(0, 8)}`;
const placeId = String(Date.now());
const profile = (userId: string, role: UserProfile['role']): UserProfile => ({
  userId,
  name: userId,
  callsign: 'QA',
  role,
  trainingStage: 'certified',
  strikes: 0,
});
const a = profile(`${tag}-a`, 'dispatcher'),
  b = profile(`${tag}-b`, 'dispatcher');
const driverA = profile(`${tag}-da`, 'driver'),
  driverB = profile(`${tag}-db`, 'driver');
async function main() {
  // Use an empty recurring plan fixture only when the external Appwrite service is unavailable.
  if (process.argv.includes('--offline-gvd'))
    mock.method(Databases.prototype, 'listDocuments', async () => ({ documents: [] }));
  const mongo = await getMongoDb();
  let sessionId = '';
  try {
    const session = await stationService.createMockSession();
    sessionId = session._id;
    const station = await stationService.createStation(sessionId, 'qa-a');
    await stationService.createStation(sessionId, 'qa-b');
    await mongo.collection('roblox_place_templates').insertOne({
      _id: `${getDisUniverseId()}:${placeId}` as never,
      universeId: getDisUniverseId(),
      placeId,
      revision: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      schema: {
        version: 1,
        stations: [
          { stationId: 'qa-a', layout: station.layout },
          { stationId: 'qa-b', layout: station.layout },
        ],
        lineblockLinks: [],
      },
    });
    await mongo.collection('sessions').updateOne(
      { _id: sessionId as never },
      {
        $set: {
          interpreter: {
            kind: 'roblox',
            universeId: getDisUniverseId(),
            placeId,
            serverId: tag,
            heartbeat: { lastHeartbeatAt: new Date().toISOString() },
          },
        },
      },
    );
    const scope = { sessionId, stationId: 'qa-a' };
    await assert.rejects(
      authorizeStationCommand(new Request('http://localhost/'), sessionId, 'qa-a'),
      { status: 401 },
    );
    await assert.rejects(claimStation(scope, driverA), { status: 403 });
    const race = await Promise.allSettled([claimStation(scope, a), claimStation(scope, b)]);
    assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
    const owner = (await listStationClaims(sessionId))[0].userId === a.userId ? a : b;
    const other = owner.userId === a.userId ? b : a;
    await claimStation({ sessionId, stationId: 'qa-b' }, owner);
    assert.equal((await listStationClaims(sessionId)).length, 2);
    await assert.rejects(requireStationClaim(sessionId, 'qa-a', other), { status: 403 });
    const reminder = {
      id: randomUUID(),
      kind: 'maintenance',
      x: 0,
      y: 0,
      text: 'Na zariadení sa pracuje',
    };
    await changeReminder({ ...scope, action: 'save', reminder }, owner);
    await assert.rejects(changeReminder({ ...scope, action: 'delete', id: reminder.id }, other), {
      status: 403,
    });
    assert.equal((await loadReminders(scope)).reminders[0].text, reminder.text);
    await releaseStation(scope, owner);
    await claimStation(scope, other);
    assert.equal(
      (await loadReminders(scope)).reminders.length,
      1,
      'station handover preserves reminders',
    );
    await mongo
      .collection('session_station_claims')
      .updateOne({ ...scope }, { $set: { expiresAt: Date.now() - 1 } });
    await renewOperationClaims(sessionId, other.userId);
    await assert.rejects(requireStationClaim(sessionId, 'qa-a', other), { status: 403 });
    await claimStation(scope, owner);
    const before = (await listStationClaims(sessionId)).find(
      (c) => c.stationId === 'qa-a',
    )!.expiresAt;
    await renewOperationClaims(sessionId, owner.userId);
    assert.ok(
      (await listStationClaims(sessionId)).find((c) => c.stationId === 'qa-a')!.expiresAt >= before,
    );
    const line = { id: randomUUID(), placeId, name: 'QA 120B', stations: ['qa-a', 'qa-b'] };
    await saveLine(line);
    assert.equal((await loadLines(placeId))[0].name, 'QA 120B');
    await assert.rejects(saveLine({ ...line, stations: ['qa-a', 'missing'] }), { status: 400 });
    const timetable = {
      trainNumber: tag,
      trainType: 'Os',
      maxSpeed: 100,
      trainLength: 120,
      stops: [
        { station: 'qa-a', arrival: '23:55', departure: '23:57', kilometer: 0, speedLimit: 80 },
        { station: 'qa-b', arrival: '00:10', departure: '00:12', kilometer: 12.5, speedLimit: 60 },
      ],
    };
    const saved = await saveSessionTimetable({ sessionId, timetable });
    assert.ok(saved.timetable);
    assert.equal((await loadOperatingTimetables(sessionId)).length, 1);
    const input = {
      sessionId,
      trainNumber: tag,
      trainType: 'Os',
      timetableId: saved.timetable.$id,
      endStation: 'qa-b',
      length: 120,
      tonnage: 100,
      wagons: 2,
    };
    const trainRace = await Promise.allSettled([
      saveDriverTrain(input, driverA),
      saveDriverTrain(input, driverB),
    ]);
    assert.equal(trainRace.filter((r) => r.status === 'fulfilled').length, 1);
    const driverOwner = (await loadDriverDashboard(sessionId, driverA)).train ? driverA : driverB;
    const driverOther = driverOwner.userId === driverA.userId ? driverB : driverA;
    await mongo
      .collection('session_driver_trains')
      .updateOne({ sessionId }, { $set: { expiresAt: Date.now() - 1 } });
    await renewOperationClaims(sessionId, driverOwner.userId);
    assert.equal((await loadDriverDashboard(sessionId, driverOwner)).train, null);
    await saveDriverTrain(input, driverOther);
    await finishDriverTrain(sessionId, driverOther);
    await deleteLine(line);
    assert.equal((await loadLines(placeId)).length, 0);
    console.log(
      'PASS: exclusive station/train races, expiry, shared renewal, station handover, reminders, lines and session GVD.',
    );
  } finally {
    for (const name of [
      'stations',
      'station_actions',
      'session_station_claims',
      'session_driver_trains',
      'station_reminders',
      'session_timetables',
    ])
      await mongo.collection(name).deleteMany({ sessionId });
    await mongo.collection('sessions').deleteOne({ _id: sessionId as never });
    await mongo.collection('roblox_place_templates').deleteOne({ placeId });
    await mongo.collection('railway_lines').deleteMany({ placeId });
    mock.restoreAll();
    await (await getMongoClient()).close();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
