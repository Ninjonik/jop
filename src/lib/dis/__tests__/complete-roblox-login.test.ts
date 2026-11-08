import assert from 'node:assert/strict';
import { test } from 'node:test';
import { completeRobloxLogin } from '../complete-roblox-login';

test('an existing session for the same Roblox account is reused', async () => {
  await completeRobloxLogin(
    {
      get: async () => ({ $id: 'rbx_1' }),
      createSession: async () => {
        assert.fail('Must reuse session');
      },
      deleteSession: async () => {
        assert.fail('Must preserve session');
      },
    },
    'rbx_1',
    'one-time-secret',
  );
});

test('a guest consumes the callback token', async () => {
  let created = false;
  await completeRobloxLogin(
    {
      get: async () => {
        throw { code: 401 };
      },
      createSession: async (id, secret) => {
        assert.equal(id, 'rbx_1');
        assert.equal(secret, 'token');
        created = true;
      },
      deleteSession: async () => {
        assert.fail('No session to delete');
      },
    },
    'rbx_1',
    'token',
  );
  assert(created);
});

test('switching accounts deletes only the current session before creating the intended one', async () => {
  const actions: string[] = [];
  await completeRobloxLogin(
    {
      get: async () => ({ $id: 'rbx_old' }),
      deleteSession: async (id) => {
        actions.push(`delete:${id}`);
      },
      createSession: async (id) => {
        actions.push(`create:${id}`);
      },
    },
    'rbx_new',
    'token',
  );
  assert.deepEqual(actions, ['delete:current', 'create:rbx_new']);
});

test('concurrent completion or a lost response is accepted only for the intended identity', async () => {
  let reads = 0;
  await completeRobloxLogin(
    {
      get: async () => {
        if (++reads === 1) throw { code: 401 };
        return { $id: 'rbx_1' };
      },
      createSession: async () => {
        throw new Error('Creation of a session is prohibited when a session is active.');
      },
      deleteSession: async () => {
        assert.fail('No initial session');
      },
    },
    'rbx_1',
    'token',
  );
});

test('a concurrent session for a different identity does not count as successful login', async () => {
  let reads = 0;
  await assert.rejects(
    completeRobloxLogin(
      {
        get: async () => {
          if (++reads === 1) throw { code: 401 };
          return { $id: 'rbx_other' };
        },
        createSession: async () => {
          throw new Error('Session conflict');
        },
        deleteSession: async () => {},
      },
      'rbx_1',
      'token',
    ),
    /Session conflict/,
  );
});

test('an account service outage does not delete a session or consume the login token', async () => {
  await assert.rejects(
    completeRobloxLogin(
      {
        get: async () => {
          throw new Error('Service unavailable');
        },
        createSession: async () => {
          assert.fail('Do not consume token');
        },
        deleteSession: async () => {
          assert.fail('Do not delete session');
        },
      },
      'rbx_1',
      'token',
    ),
    /Service unavailable/,
  );
});
