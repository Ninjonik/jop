import { Databases } from 'node-appwrite';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { importRobloxPersonnel } from '../../server/dis/import-personnel';
import { readRobloxGroupPersonnel } from '../../server/roblox/group-personnel';

function roster(context: TestContext) {
  context.mock.method(globalThis, 'fetch', async (input: URL) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/roles'))
      return Response.json({
        groupId: 34,
        roles: [
          { id: 1, name: 'Head Of Dispatchers', rank: 203 },
          { id: 2, name: 'Dispatcher', rank: 4 },
          { id: 3, name: 'Other Staff', rank: 18 },
        ],
      });
    if (url.pathname.includes('/roles/1/'))
      return Response.json({
        data: [{ userId: 56, username: 'boss', displayName: 'Boss' }],
        nextPageCursor: null,
      });
    assert.ok(url.pathname.includes('/roles/2/'), 'Unmapped roles must not be imported');
    if (!url.searchParams.has('cursor'))
      return Response.json({
        data: [{ userId: 56, username: 'boss', displayName: 'Boss' }],
        nextPageCursor: 'next',
      });
    return Response.json({
      data: [{ userId: 57, username: 'dispatcher', displayName: 'Dispatcher' }],
      nextPageCursor: null,
    });
  });
}

test('roster pagination includes secondary roles and chooses the highest authorized role per person', async (context) => {
  roster(context);
  const profiles = await readRobloxGroupPersonnel('34');
  assert.equal(profiles.length, 2);
  assert.equal(
    profiles.find((profile) => profile.robloxUserId === '56')?.role,
    'dispatcher_manager',
  );
  assert.equal(profiles.find((profile) => profile.robloxUserId === '57')?.role, 'dispatcher');
});

test('personnel import is rerunnable and preserves existing assessments without updates', async (context) => {
  roster(context);
  const previous = process.env.APPWRITE_API_KEY;
  process.env.APPWRITE_API_KEY = 'synthetic-test-key';
  context.after(() => {
    if (previous === undefined) delete process.env.APPWRITE_API_KEY;
    else process.env.APPWRITE_API_KEY = previous;
  });
  const stored = new Map<string, Record<string, unknown>>([
    ['rbx_56', { $id: 'rbx_56', strikes: 4, trainingStage: 'exam', notes: 'Preserve' }],
  ]);
  context.mock.method(Databases.prototype, 'listDocuments', async () => ({
    documents: [...stored.values()],
  }));
  const writes = context.mock.method(
    Databases.prototype,
    'createDocument',
    async (
      _database: string,
      _collection: string,
      id: string,
      profile: Record<string, unknown>,
    ) => {
      stored.set(id, { ...profile, $id: id });
      return profile;
    },
  );
  context.mock.method(Databases.prototype, 'updateDocument', async () => {
    throw new Error('Existing profiles must not be updated');
  });
  const preview = await importRobloxPersonnel('34', false);
  assert.equal(preview.missing, 1);
  assert.equal(writes.mock.callCount(), 0);
  assert.equal((await importRobloxPersonnel('34', true)).created, 1);
  assert.equal((await importRobloxPersonnel('34', true)).created, 0);
  assert.deepEqual(stored.get('rbx_56'), {
    $id: 'rbx_56',
    strikes: 4,
    trainingStage: 'exam',
    notes: 'Preserve',
  });
});

test('an unavailable roster aborts before writing any profile', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }));
  const writes = context.mock.method(Databases.prototype, 'createDocument', async () => {
    throw new Error('Must not write');
  });
  await assert.rejects(importRobloxPersonnel('34', true), /HTTP 503/);
  assert.equal(writes.mock.callCount(), 0);
});
