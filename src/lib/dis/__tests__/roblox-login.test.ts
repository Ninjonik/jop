import { NextRequest } from 'next/server';
import { AppwriteException, Databases, Users } from 'node-appwrite';
import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { GET } from '../../../app/api/auth/roblox/callback/route';

function environment(context: TestContext) {
  for (const [key, value] of Object.entries({
    ROBLOX_CLIENT_ID: 'test-client',
    ROBLOX_CLIENT_SECRET: 'test-secret',
    ROBLOX_GROUP_ID: '34',
  })) {
    const previous = process.env[key];
    process.env[key] = value;
    context.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }
}
function callback(state = 'test-state') {
  return new NextRequest(
    `http://localhost/api/auth/roblox/callback?code=test-code&state=${state}`,
    { headers: { Cookie: 'roblox_oauth_state=test-state' } },
  );
}
function mockRoblox(context: TestContext, member = true, role = { name: 'Dispatcher', rank: 4 }) {
  context.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    const url = String(input);
    if (url.endsWith('/oauth/v1/token'))
      return Response.json({ access_token: 'test-access-token' });
    if (url.endsWith('/oauth/v1/userinfo'))
      return Response.json({ sub: '56', preferred_username: 'TestDriver', name: 'Test User' });
    if (url.includes('groups.roblox.com/v2/users/56/'))
      return Response.json({
        data: member ? [{ group: { id: 34 }, role }] : [],
      });
    throw new Error(`Unexpected external request: ${url}`);
  });
}
function loginToken(context: TestContext) {
  return context.mock.method(Users.prototype, 'createToken', async () => ({
    userId: 'rbx_56',
    secret: 'synthetic-one-time-secret',
  }));
}
test('OAuth callback creates a first account/profile with the verified group role', async (context) => {
  environment(context);
  mockRoblox(context);
  context.mock.method(Users.prototype, 'get', async () => {
    throw new AppwriteException('Missing', 404);
  });
  const userCreation = context.mock.method(Users.prototype, 'create', async () => ({}));
  context.mock.method(Databases.prototype, 'getDocument', async () => {
    throw new AppwriteException('Missing', 404);
  });
  let createdProfile: Record<string, unknown> = {};
  context.mock.method(
    Databases.prototype,
    'createDocument',
    async (_db: string, _collection: string, _id: string, profile: Record<string, unknown>) => {
      createdProfile = profile;
      return profile;
    },
  );
  loginToken(context);
  const response = await GET(callback());
  const location = new URL(response.headers.get('location')!);
  assert.equal(location.pathname, '/dis/auth-complete');
  assert.equal(location.searchParams.get('userId'), 'rbx_56');
  assert.equal(createdProfile.role, 'dispatcher');
  assert.equal(createdProfile.robloxRank, 4);
  assert.equal(userCreation.mock.callCount(), 1);
  assert.match(response.headers.get('set-cookie') || '', /roblox_oauth_state=/);
});
test('subsequent login preserves the personnel assessment when the Roblox role is unchanged', async (context) => {
  environment(context);
  mockRoblox(context);
  context.mock.method(Users.prototype, 'get', async () => ({}));
  context.mock.method(Databases.prototype, 'getDocument', async () => ({
    role: 'dispatcher',
    trainingStage: 'exam',
    strikes: 3,
  }));
  let update: Record<string, unknown> = {};
  context.mock.method(
    Databases.prototype,
    'updateDocument',
    async (_db: string, _collection: string, _id: string, payload: Record<string, unknown>) => {
      update = payload;
      return payload;
    },
  );
  loginToken(context);
  assert.equal(
    new URL((await GET(callback())).headers.get('location')!).pathname,
    '/dis/auth-complete',
  );
  assert.equal(update.role, 'dispatcher');
  assert(!('trainingStage' in update));
  assert(!('strikes' in update));
});
test('concurrent first logins recover deterministic account/profile creation conflicts', async (context) => {
  environment(context);
  mockRoblox(context);
  let userReads = 0;
  context.mock.method(Users.prototype, 'get', async () => {
    if (userReads++ === 0) throw new AppwriteException('Missing', 404);
    return {};
  });
  context.mock.method(Users.prototype, 'create', async () => {
    throw new AppwriteException('Exists', 409);
  });
  context.mock.method(Databases.prototype, 'getDocument', async () => {
    throw new AppwriteException('Missing', 404);
  });
  context.mock.method(Databases.prototype, 'createDocument', async () => {
    throw new AppwriteException('Exists', 409);
  });
  const update = context.mock.method(Databases.prototype, 'updateDocument', async () => ({}));
  loginToken(context);
  assert.equal(
    new URL((await GET(callback())).headers.get('location')!).pathname,
    '/dis/auth-complete',
  );
  assert.equal(update.mock.callCount(), 1);
});
test('non-members never receive an Appwrite login token', async (context) => {
  environment(context);
  mockRoblox(context, false);
  const token = loginToken(context);
  const location = new URL((await GET(callback())).headers.get('location')!);
  assert.equal(location.searchParams.get('error'), 'not_group_member');
  assert.equal(token.mock.callCount(), 0);
});
test('unmapped group roles never receive an Appwrite login token', async (context) => {
  environment(context);
  mockRoblox(context, true, { name: 'Unused role 1', rank: 253 });
  const token = loginToken(context);
  const location = new URL((await GET(callback())).headers.get('location')!);
  assert.equal(location.searchParams.get('error'), 'role_not_authorized');
  assert.equal(token.mock.callCount(), 0);
});
test('OAuth state mismatch is rejected before any external request', async (context) => {
  const request = context.mock.method(globalThis, 'fetch', async () => {
    throw new Error('Must not be called');
  });
  const location = new URL((await GET(callback('wrong-state'))).headers.get('location')!);
  assert.equal(location.searchParams.get('error'), 'invalid_state');
  assert.equal(request.mock.callCount(), 0);
});
