/** Callsign allocation uses an isolated Mongo collection and in-memory Appwrite fixtures. */
import { Db, type CollectionOptions } from 'mongodb';
import { Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

async function main() {
  const testCollection = `personnel_callsigns_qa_${randomUUID().replaceAll('-', '')}`;
  const originalCollection = Db.prototype.collection;
  const collections = mock.method(
    Db.prototype,
    'collection',
    function (this: Db, name: string, options?: CollectionOptions) {
      return originalCollection.call(
        this,
        name === 'personnel_callsigns' ? testCollection : name,
        options,
      );
    },
  );
  const { getMongoDb, getMongoClient } = await import('../src/lib/server/mongo');
  const { allocatePersonnelCallsign, ensurePersonnelCallsigns } =
    await import('../src/lib/server/dis/callsigns');
  const profiles = [
    { $id: 'one', userId: 'one', callsign: 'ZSSK-123' },
    { $id: 'two', userId: 'two', callsign: 'ZSSK-123' },
    { $id: 'three', userId: 'three', callsign: 'ZSSK-000' },
    { $id: 'four', userId: 'four', callsign: 'ZSSK-042' },
  ];
  const reads = mock.method(Databases.prototype, 'listDocuments', async () => ({
    documents: profiles.map((p) => ({ ...p })),
    total: profiles.length,
  }));
  const writes = mock.method(Databases.prototype, 'updateDocument', async (...args: unknown[]) => {
    const profile = profiles.find((p) => p.$id === args[2]);
    assert(profile);
    Object.assign(profile, args[3]);
    return profile;
  });
  try {
    await ensurePersonnelCallsigns();
    assert.equal(new Set(profiles.map((p) => p.callsign)).size, profiles.length);
    assert.equal(profiles.find((p) => p.userId === 'one')?.callsign, 'ZSSK-123');
    assert.equal(profiles.find((p) => p.userId === 'four')?.callsign, 'ZSSK-042');
    assert(profiles.every((p) => /^ZSSK-(?!000)\d{3}$/.test(p.callsign)));
    const stable = structuredClone(profiles);
    await ensurePersonnelCallsigns();
    assert.deepEqual(profiles, stable);
    const [a, b, c] = await Promise.all([
      allocatePersonnelCallsign('new-a'),
      allocatePersonnelCallsign('new-a'),
      allocatePersonnelCallsign('new-b'),
    ]);
    assert.equal(a, b);
    assert.notEqual(a, c);
    const db = await getMongoDb();
    const collection = db.collection<{ _id: string; userId: string }>('personnel_callsigns');
    const occupied = new Set((await collection.find({}).toArray()).map((r) => r._id));
    const remainder = Array.from({ length: 999 }, (_, i) => String(i + 1).padStart(3, '0'))
      .filter((number) => !occupied.has(number))
      .map((number) => ({ _id: number, userId: `filler-${number}` }));
    await collection.insertMany(remainder);
    await assert.rejects(allocatePersonnelCallsign('no-room'), /999/);
    console.log('Callsign collision repair, stable allocation, concurrency and exhaustion passed.');
  } finally {
    reads.mock.restore();
    writes.mock.restore();
    try {
      await (await getMongoDb()).collection(testCollection).drop();
    } finally {
      collections.mock.restore();
      await (await getMongoClient()).close();
    }
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
