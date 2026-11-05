import { AppwriteException, Databases, Storage } from 'node-appwrite';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeDisAppwrite } from '../../server/dis/schema';

test('fresh setup provisions OAuth fields, correct numeric bounds/defaults and remains repeatable', async (context) => {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  let databaseCreated = false,
    bucketCreated = false;
  let attributesCreated = 0;
  const policy = context.mock.method(
    Databases.prototype,
    'updateCollection',
    async (params: { permissions: string[]; documentSecurity: boolean }) => {
      assert.deepEqual(params.permissions, []);
      assert.equal(params.documentSecurity, false);
      return {};
    },
  );
  context.mock.method(
    Storage.prototype,
    'updateBucket',
    async (params: { permissions: string[]; fileSecurity: boolean }) => {
      assert.deepEqual(params.permissions, []);
      assert.equal(params.fileSecurity, false);
      return {};
    },
  );
  const missing = () => new AppwriteException('Not found', 404);
  context.mock.method(Databases.prototype, 'get', async () => {
    if (!databaseCreated) throw missing();
    return {};
  });
  context.mock.method(Databases.prototype, 'create', async () => {
    databaseCreated = true;
    return {};
  });
  context.mock.method(Storage.prototype, 'getBucket', async () => {
    if (!bucketCreated) throw missing();
    return {};
  });
  context.mock.method(Storage.prototype, 'createBucket', async () => {
    bucketCreated = true;
    return {};
  });
  context.mock.method(
    Databases.prototype,
    'getCollection',
    async (_database: string, id: string) => {
      const collection = collections.get(id);
      if (!collection) throw missing();
      return { $id: id, name: id, attributes: [...collection.values()] };
    },
  );
  context.mock.method(
    Databases.prototype,
    'createCollection',
    async (_database: string, id: string) => {
      collections.set(id, new Map());
      return {};
    },
  );
  context.mock.method(
    Databases.prototype,
    'getAttribute',
    async (params: { collectionId: string; key: string }) => {
      const attribute = collections.get(params.collectionId)?.get(params.key);
      if (!attribute) throw missing();
      return attribute;
    },
  );
  const methods = ['String', 'Integer', 'Float', 'Boolean', 'Enum'] as const;
  for (const kind of methods) {
    context.mock.method(
      Databases.prototype,
      `create${kind}Attribute`,
      async (params: { collectionId: string; key: string }) => {
        attributesCreated++;
        collections.get(params.collectionId)!.set(params.key, {
          ...params,
          type: kind === 'Float' ? 'double' : kind === 'Enum' ? 'string' : kind.toLowerCase(),
          status: 'available',
        });
        return {};
      },
    );
  }
  context.mock.method(
    Databases.prototype,
    'updateIntegerAttribute',
    async (params: { collectionId: string; key: string }) => {
      Object.assign(collections.get(params.collectionId)!.get(params.key)!, params);
      return {};
    },
  );
  context.mock.method(
    Databases.prototype,
    'updateFloatAttribute',
    async (params: { collectionId: string; key: string }) => {
      Object.assign(collections.get(params.collectionId)!.get(params.key)!, params);
      return {};
    },
  );
  await initializeDisAppwrite();
  for (const key of ['robloxUserId', 'robloxUsername', 'robloxRoleName', 'robloxRank'])
    assert(collections.get('profiles')!.has(key), key);
  const speed = collections.get('timetables_gvd')!.get('maxSpeed')!;
  assert(collections.get('timetables_gvd')!.has('placeId'));
  assert.equal(speed.min, 1);
  assert.equal(speed.xdefault, 120);
  assert.equal(speed.max, 300);
  const duration = collections.get('shifts')!.get('durationHours')!;
  assert.equal(duration.min, 0);
  assert.equal(duration.xdefault, 2.5);
  const created = attributesCreated;
  // A partially initialized existing collection must gain missing fields without deleting data.
  collections.get('profiles')!.delete('robloxUsername');
  await initializeDisAppwrite();
  assert.equal(attributesCreated, created + 1);
  assert.equal(collections.size, 7);
  assert.equal(policy.mock.callCount(), 14);
});
test('setup stops on service failure instead of claiming a successful installation', async (context) => {
  context.mock.method(Databases.prototype, 'get', async () => {
    throw new AppwriteException('Service unavailable', 500);
  });
  await assert.rejects(initializeDisAppwrite(), /Service unavailable/);
});
