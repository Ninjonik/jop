import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getRobloxUserGroupRole,
  mapRobloxRoleToDis,
  RobloxGroupLookupError,
} from '../roblox-roles';

const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status });
test('public group roles use the actual configured group and rank', async (context) => {
  context.mock.method(globalThis, 'fetch', async () =>
    json({
      data: [
        { group: { id: 12 }, role: { name: 'Owner', rank: 255 } },
        { group: { id: 34 }, role: { name: 'Dispatcher', rank: 4 } },
      ],
    }),
  );
  const role = await getRobloxUserGroupRole('56', '34');
  assert.deepEqual(role, { roleName: 'Dispatcher', rank: 4 });
  assert.equal(mapRobloxRoleToDis(role!.roleName, role!.rank)?.role, 'dispatcher');
});
test('only explicitly mapped Roblox roles receive the intended DIS role', () => {
  const cases = [
    ['Driver', 2, 'driver'],
    ['Dispatcher', 4, 'dispatcher'],
    ['Trainee Driver', 8, 'driver_trainee'],
    ['Trainee Dispatcher', 9, 'dispatcher_trainee'],
    ['Driver Trainer', 28, 'driver_instructor'],
    ['Dispatcher Trainer', 30, 'dispatcher_instructor'],
    ['Head Of Conductors', 199, 'admin'],
    ['Head Of Drivers', 201, 'driver_manager'],
    ['Head Of Dispatchers', 203, 'dispatcher_manager'],
    ['Contributor', 235, 'admin'],
    ['Board of Executives', 254, 'admin'],
    ['Executive Director', 255, 'admin'],
  ] as const;
  for (const [name, rank, role] of cases) assert.equal(mapRobloxRoleToDis(name, rank)?.role, role);
  for (const [name, rank] of [
    ['Passenger', 1],
    ['Member', 1],
    ['Unused role 1', 253],
    ['Other Staff', 18],
    ['Driver', 255],
    ['Unknown', 255],
    ['Head Of Conductors', 198],
    ['Contributor', 234],
    ['Contributor', 250],
  ] as const)
    assert.equal(mapRobloxRoleToDis(name, rank), null);
});
test('a definitive non-member response does not trigger a privileged fallback', async (context) => {
  const request = context.mock.method(globalThis, 'fetch', async () => json({ data: [] }));
  assert.equal(await getRobloxUserGroupRole('56', '34'), null);
  assert.equal(request.mock.callCount(), 1);
});
test('Open Cloud resolves all assigned role paths and chooses the highest actual rank', async (context) => {
  const previous = process.env.ROBLOX_API_KEY;
  process.env.ROBLOX_API_KEY = 'synthetic-test-key';
  context.after(() => {
    if (previous === undefined) delete process.env.ROBLOX_API_KEY;
    else process.env.ROBLOX_API_KEY = previous;
  });
  context.mock.method(globalThis, 'fetch', async (input: string | URL, options: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === 'groups.roblox.com') return json({}, 429);
    assert.equal(new Headers(options.headers).get('x-api-key'), 'synthetic-test-key');
    if (url.pathname.endsWith('/memberships')) {
      assert.equal(url.searchParams.get('filter'), "user == 'users/56'");
      return json({
        groupMemberships: [
          { user: 'users/56', roles: ['groups/34/roles/11', 'groups/34/roles/22'] },
        ],
      });
    }
    return url.pathname.endsWith('/22')
      ? json({ displayName: 'Hlavný dispečer', rank: 200 })
      : json({ displayName: 'Rušňovodič', rank: 20 });
  });
  assert.deepEqual(await getRobloxUserGroupRole('56', '34'), {
    roleName: 'Hlavný dispečer',
    rank: 200,
  });
});
test('failed lookups are availability errors, never invented membership or rank', async (context) => {
  const previous = process.env.ROBLOX_API_KEY;
  delete process.env.ROBLOX_API_KEY;
  context.after(() => {
    if (previous !== undefined) process.env.ROBLOX_API_KEY = previous;
  });
  context.mock.method(globalThis, 'fetch', async () => json({}, 503));
  await assert.rejects(getRobloxUserGroupRole('56', '34'), RobloxGroupLookupError);
});
test('a fallback role path from another group is rejected', async (context) => {
  const previous = process.env.ROBLOX_API_KEY;
  process.env.ROBLOX_API_KEY = 'synthetic-test-key';
  context.after(() => {
    if (previous === undefined) delete process.env.ROBLOX_API_KEY;
    else process.env.ROBLOX_API_KEY = previous;
  });
  context.mock.method(globalThis, 'fetch', async (input: string | URL) =>
    String(input).includes('groups.roblox.com')
      ? json({}, 503)
      : json({ groupMemberships: [{ user: 'users/56', role: 'groups/999/roles/1' }] }),
  );
  await assert.rejects(getRobloxUserGroupRole('56', '34'), RobloxGroupLookupError);
});

test('Contributor does not mask Head Of Dispatchers in a multi-role membership', async (context) => {
  const previous = process.env.ROBLOX_API_KEY;
  process.env.ROBLOX_API_KEY = 'synthetic-test-key';
  context.after(() => {
    if (previous === undefined) delete process.env.ROBLOX_API_KEY;
    else process.env.ROBLOX_API_KEY = previous;
  });
  context.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'groups.roblox.com')
      return json({ data: [{ group: { id: 34 }, role: { name: 'Contributor', rank: 250 } }] });
    if (url.pathname.endsWith('/memberships'))
      return json({
        groupMemberships: [
          { user: 'users/56', roles: ['groups/34/roles/11', 'groups/34/roles/22'] },
        ],
      });
    return url.pathname.endsWith('/22')
      ? json({ displayName: 'Head Of Dispatchers', rank: 203 })
      : json({ displayName: 'Contributor', rank: 250 });
  });
  assert.deepEqual(await getRobloxUserGroupRole('56', '34'), {
    roleName: 'Head Of Dispatchers',
    rank: 203,
  });
});

test('unsupported group-owned keys preserve the Roblox HTTP error without exposing the key', async (context) => {
  const previous = process.env.ROBLOX_API_KEY;
  process.env.ROBLOX_API_KEY = 'synthetic-test-key';
  context.after(() => {
    if (previous === undefined) delete process.env.ROBLOX_API_KEY;
    else process.env.ROBLOX_API_KEY = previous;
  });
  context.mock.method(globalThis, 'fetch', async (input: string | URL) =>
    String(input).includes('groups.roblox.com')
      ? json({}, 503)
      : json(
          {
            code: 'UNAUTHENTICATED',
            message:
              'Unsupported authorization method. Only OAuth tokens and User API keys are supported at this time. synthetic-test-key',
          },
          401,
        ),
  );
  await assert.rejects(getRobloxUserGroupRole('56', '34'), (error: unknown) => {
    assert.ok(error instanceof RobloxGroupLookupError);
    assert.match(
      error.message,
      /Membership lookup returned HTTP 401.*UNAUTHENTICATED.*User API keys/,
    );
    assert.ok(!error.message.includes('synthetic-test-key'));
    return true;
  });
});

test('login uses its OAuth token instead of the configured group API key', async (context) => {
  context.mock.method(globalThis, 'fetch', async (input: string | URL, options: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === 'groups.roblox.com') return json({}, 503);
    const headers = new Headers(options.headers);
    assert.equal(headers.get('Authorization'), 'Bearer login-token');
    assert.equal(headers.has('x-api-key'), false);
    if (url.pathname.endsWith('/memberships'))
      return json({ groupMemberships: [{ user: 'users/56', roles: ['groups/34/roles/22'] }] });
    return json({ displayName: 'Head Of Dispatchers', rank: 203 });
  });
  assert.deepEqual(await getRobloxUserGroupRole('56', '34', 'login-token'), {
    roleName: 'Head Of Dispatchers',
    rank: 203,
  });
});

test('Contributor admin access is resolved even when the public API reports a lower role', async (context) => {
  context.mock.method(globalThis, 'fetch', async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname === 'groups.roblox.com')
      return json({ data: [{ group: { id: 34 }, role: { name: 'Dispatcher', rank: 4 } }] });
    if (url.pathname.endsWith('/memberships'))
      return json({
        groupMemberships: [
          { user: 'users/56', roles: ['groups/34/roles/11', 'groups/34/roles/22'] },
        ],
      });
    return url.pathname.endsWith('/22')
      ? json({ displayName: 'Contributor', rank: 235 })
      : json({ displayName: 'Dispatcher', rank: 4 });
  });
  const role = await getRobloxUserGroupRole('56', '34', 'login-token');
  assert.deepEqual(role, { roleName: 'Contributor', rank: 235 });
  assert.equal(mapRobloxRoleToDis(role!.roleName, role!.rank)?.role, 'admin');
});
