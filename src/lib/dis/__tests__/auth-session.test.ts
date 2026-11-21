import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clearDisToken, disFetch, DisRequestError, getDisToken } from '../api-client';
import { account } from '../appwrite-client';
import { restoreDisSession } from '../restore-session';

const jwt = (label: string, expiry = Date.now() + 3600000) =>
  `test.${Buffer.from(JSON.stringify({ label, exp: Math.floor(expiry / 1000) })).toString('base64url')}.signature`;

test('parallel requests share one fresh JWT', async (context) => {
  clearDisToken();
  context.after(clearDisToken);
  const value = jwt('shared');
  const mint = context.mock.method(account, 'createJWT', async () => ({ jwt: value }));
  assert.deepEqual(await Promise.all([getDisToken(), getDisToken(), getDisToken()]), [
    value,
    value,
    value,
  ]);
  assert.equal(mint.mock.callCount(), 1);
});
test('JWT cache honors its real expiry rather than treating every token as fresh for ten minutes', async (context) => {
  clearDisToken();
  context.after(clearDisToken);
  let now = 1800000000000;
  context.mock.method(Date, 'now', () => now);
  let generation = 0;
  const mint = context.mock.method(account, 'createJWT', async () => ({
    jwt: jwt(String(++generation), now + 60000),
  }));
  const first = await getDisToken();
  now += 31000;
  assert.notEqual(await getDisToken(), first);
  assert.equal(mint.mock.callCount(), 2);
});
test('clearing authentication prevents an old in-flight JWT from restoring it', async (context) => {
  clearDisToken();
  context.after(clearDisToken);
  let resolve!: (result: { jwt: string }) => void;
  context.mock.method(
    account,
    'createJWT',
    () =>
      new Promise<{ jwt: string }>((done) => {
        resolve = done;
      }),
  );
  const pending = getDisToken();
  clearDisToken();
  resolve({ jwt: jwt('old') });
  await assert.rejects(pending, /Prihlásenie sa zmenilo/);
});
test('a rejected API token is refreshed once and the original request is replayed', async (context) => {
  clearDisToken();
  context.after(clearDisToken);
  let generation = 0;
  const mint = context.mock.method(account, 'createJWT', async () => ({
    jwt: jwt(String(++generation)),
  }));
  const requests: { auth: string | null; method?: string; body?: BodyInit | null }[] = [];
  context.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    requests.push({
      auth: new Headers(init.headers).get('Authorization'),
      method: init.method,
      body: init.body,
    });
    return requests.length === 1
      ? Response.json({ error: 'expired' }, { status: 401 })
      : Response.json({ saved: true });
  });
  assert.deepEqual(await disFetch('/test', { method: 'POST', body: '{"command":"save"}' }), {
    saved: true,
  });
  assert.equal(mint.mock.callCount(), 2);
  assert.equal(requests.length, 2);
  assert.notEqual(requests[0].auth, requests[1].auth);
  assert.equal(requests[1].body, requests[0].body);
  assert.equal(requests[1].method, 'POST');
});
test('simultaneous token rejections share the replacement instead of invalidating each other', async (context) => {
  clearDisToken();
  context.after(clearDisToken);
  let generation = 0;
  const stale = jwt('stale'),
    fresh = jwt('fresh');
  const mint = context.mock.method(account, 'createJWT', async () => ({
    jwt: ++generation === 1 ? stale : fresh,
  }));
  context.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) =>
    new Headers(init.headers).get('Authorization') === `Bearer ${stale}`
      ? Response.json({ error: 'expired' }, { status: 401 })
      : Response.json({ ok: true }),
  );
  assert.deepEqual(await Promise.all([disFetch('/a'), disFetch('/b')]), [
    { ok: true },
    { ok: true },
  ]);
  assert.equal(mint.mock.callCount(), 2);
});
test('permission rejection is not retried and HTML outages preserve the authenticated token', async (context) => {
  clearDisToken();
  context.after(clearDisToken);
  const mint = context.mock.method(account, 'createJWT', async () => ({ jwt: jwt('valid') }));
  let status = 403;
  const send = context.mock.method(globalThis, 'fetch', async () =>
    status === 403
      ? Response.json({ error: 'forbidden' }, { status })
      : new Response('<h1>Bad Gateway</h1>', { status }),
  );
  await assert.rejects(
    disFetch('/forbidden'),
    (error) => error instanceof DisRequestError && error.status === 403,
  );
  status = 502;
  await assert.rejects(
    disFetch('/offline'),
    (error) => error instanceof DisRequestError && error.status === 502,
  );
  await getDisToken();
  assert.equal(send.mock.callCount(), 2);
  assert.equal(mint.mock.callCount(), 1);
});
test('opening a tab can restore its existing session after a temporary failure', async (context) => {
  let calls = 0;
  context.mock.method(account, 'get', async () => {
    if (++calls === 1) throw { code: 503 };
    return { $id: 'existing-user' } as never;
  });
  assert.equal((await restoreDisSession())?.$id, 'existing-user');
});
test('a persistent connection failure never becomes a signed-out result', async (context) => {
  context.mock.method(account, 'get', async () => {
    throw { code: 503 };
  });
  await assert.rejects(restoreDisSession(), { code: 503 });
});
test('only an explicit session rejection after retry returns signed out', async (context) => {
  const get = context.mock.method(account, 'get', async () => {
    throw { code: 401 };
  });
  assert.equal(await restoreDisSession(), null);
  assert.equal(get.mock.callCount(), 2);
});
test('a failed retry remains unavailable even after an initial 401', async (context) => {
  let calls = 0;
  context.mock.method(account, 'get', async () => {
    throw { code: ++calls === 1 ? 401 : 503 };
  });
  await assert.rejects(restoreDisSession(), { code: 503 });
});

test('a request is never replayed after login state changed during its response', async (context) => {
  clearDisToken();
  context.after(clearDisToken);
  const mint = context.mock.method(account, 'createJWT', async () => ({
    jwt: jwt('original-user'),
  }));
  const send = context.mock.method(globalThis, 'fetch', async () => {
    clearDisToken();
    return Response.json({ error: 'expired' }, { status: 401 });
  });
  await assert.rejects(
    disFetch('/command', { method: 'POST', body: '{}' }),
    (error) => error instanceof DisRequestError && error.status === 401,
  );
  assert.equal(send.mock.callCount(), 1);
  assert.equal(mint.mock.callCount(), 1);
});
