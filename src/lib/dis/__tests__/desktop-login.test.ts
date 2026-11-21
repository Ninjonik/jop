import { NextRequest } from 'next/server';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { desktopCallback } from '../../desktop';
import { allowedClientOrigin } from '../../server/cors';
import { getRobloxReturnUrl } from '../roblox-oauth-url';

test('desktop callbacks require an unexpired login attempt and consume it only once', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const nonce = 'a'.repeat(64);
    values.set('jop-desktop-login', JSON.stringify({ nonce, expires: Date.now() + 60000 }));
    assert.equal(desktopCallback(`jop-dis://auth/complete?nonce=wrong&userId=u&secret=s`), null);
    assert.equal(desktopCallback(`https://auth/complete?nonce=${nonce}&userId=u&secret=s`), null);
    const callback = `jop-dis://auth/complete?nonce=${nonce}&userId=u&secret=s`;
    assert.equal(desktopCallback(callback), '/dis/auth-complete?userId=u&secret=s');
    assert.equal(desktopCallback(callback), null);
    values.set('jop-desktop-login', JSON.stringify({ nonce, expires: Date.now() - 1 }));
    assert.equal(desktopCallback(callback), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('OAuth sends desktop success and errors to the fixed application scheme', () => {
  const nonce = 'b'.repeat(64);
  const request = new NextRequest('https://api.example/api/auth/roblox/callback', {
    headers: { cookie: `roblox_desktop_nonce=${nonce}` },
  });
  const result = getRobloxReturnUrl(request, '/dis/auth-complete');
  assert.equal(result.protocol, 'jop-dis:');
  assert.equal(result.host, 'auth');
  assert.equal(result.searchParams.get('nonce'), nonce);
  assert.equal(
    getRobloxReturnUrl(request, '/dis/login?error=invalid_state').searchParams.get('error'),
    'invalid_state',
  );
});

test('cross-origin access permits desktop origins and rejects unrelated sites', () => {
  assert.equal(allowedClientOrigin('tauri://localhost'), true);
  assert.equal(allowedClientOrigin('http://tauri.localhost'), true);
  assert.equal(allowedClientOrigin('https://unrelated.example'), false);
  assert.equal(allowedClientOrigin('https://api.example', 'api.example'), true);
});
