/** Real Mongo verification in an isolated universe; no production timetables are changed. */
import { Account, Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
async function main() {
  const universe = Date.now().toString();
  process.env.ROBLOX_UNIVERSE_ID = universe;
  const { getMongoDb, getMongoClient } = await import('../src/lib/server/mongo');
  const db = await getMongoDb();
  const placeId = '113144512557419',
    otherPlace = '9000000000000001';
  const user = 'qa-ncp-' + randomUUID();
  const originalAccount = Account.prototype.get,
    originalProfile = Databases.prototype.getDocument;
  try {
    await db.collection('roblox_place_templates').insertMany([
      {
        universeId: universe,
        placeId,
        schema: { stations: [{ stationId: 'kolarovo' }, { stationId: 'vesele' }] },
      },
      { universeId: universe, placeId: otherPlace, schema: { stations: [] } },
    ]);
    const { loadRailwayNetwork, saveRailwayNetwork } =
      await import('../src/lib/server/dis/railway-network');
    const initial = await loadRailwayNetwork(placeId);
    assert.equal(initial.updatedAt, null);
    assert.equal(initial.network.points.length, 18);
    initial.network.points.find((p) => p.id === 'vesele')!.symbols = ['speed', 'dispatch'];
    const saved = await saveRailwayNetwork({
      placeId,
      network: initial.network,
      expectedUpdatedAt: null,
    });
    assert.ok(saved.updatedAt);
    assert.deepEqual(
      (await loadRailwayNetwork(placeId)).network.points.find((p) => p.id === 'vesele')!.symbols,
      ['speed', 'dispatch'],
    );
    await assert.rejects(
      () => saveRailwayNetwork({ placeId, network: initial.network, expectedUpdatedAt: null }),
      /medzitým/,
    );
    assert.equal((await loadRailwayNetwork(otherPlace)).network.points.length, 0);
    const { validateTimetablePlace } = await import('../src/lib/server/dis/timetables');
    await validateTimetablePlace(placeId, [
      'kolarovo',
      'stefanovo',
      'mytna',
      'vesele',
      'ah-brekov',
    ]);
    // Exercise account scoping through the actual preference routes, substituting auth only.
    let identity = user;
    Account.prototype.get = (async () => ({ $id: identity })) as typeof originalAccount;
    Databases.prototype.getDocument = (async () => ({
      userId: identity,
      role: 'driver',
    })) as typeof originalProfile;
    const prefs = await import('../apps/api/src/app/api/dis/preferences/route');
    const post = await prefs.POST(
      new Request('http://localhost/api/dis/preferences', {
        method: 'POST',
        headers: { Authorization: 'Bearer fixture' },
        body: JSON.stringify({
          key: 'ncp:test',
          value: { dragEnabled: true, onlySelected: true, order: ['kolarovo', 'vesele'] },
        }),
      }),
    );
    assert.equal(post.status, 200);
    const read = () =>
      prefs.GET(
        new Request('http://localhost/api/dis/preferences?key=ncp:test', {
          headers: { Authorization: 'Bearer fixture' },
        }),
      );
    assert.equal((await (await read()).json()).value.dragEnabled, true);
    identity = user + '-other';
    assert.equal((await (await read()).json()).value, null);
    console.log(
      'Verified: seeded boundaries, persisted symbols, stale-save protection, place isolation, screenshot route validation, and per-account preferences.',
    );
  } finally {
    Account.prototype.get = originalAccount;
    Databases.prototype.getDocument = originalProfile;
    await db.collection('roblox_place_templates').deleteMany({ universeId: universe });
    await db
      .collection('railway_networks')
      .deleteMany({
        _id: { $in: [JSON.stringify([universe, placeId]), JSON.stringify([universe, otherPlace])] },
      } as never);
    await db
      .collection('dis_preferences')
      .deleteMany({
        _id: {
          $in: [JSON.stringify([user, 'ncp:test']), JSON.stringify([user + '-other', 'ncp:test'])],
        },
      } as never);
    await (await getMongoClient()).close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
