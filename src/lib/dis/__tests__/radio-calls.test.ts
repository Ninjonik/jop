import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RadioCalls, type RadioEmit, type RadioMedia } from '../../server/dis/radio-calls';
import { radioMedia } from '../../server/dis/radio-media';
import type { RadioTerminalDocument } from '../../server/repositories/radio-terminal-repository';
import type { ChatEndpoint, ChatMessage } from '../chat';
import { RADIO_LEASE_MS, type RadioTerminalState } from '../radio';

function fixture(mediaOverrides: Partial<RadioMedia> = {}) {
  let time = 1000;
  const states = new Map<string, RadioTerminalDocument>();
  const positions = new Map<string, string | null>();
  const events: { socket: string; event: string; payload: unknown }[] = [];
  const tokens: { id: string; socket: string; publish: boolean }[] = [];
  const messages: ChatMessage[] = [];
  const closed: string[] = [],
    removed: string[] = [];
  const radio = new RadioCalls({
    now: () => time,
    actorName: (userId) => userId,
    async recordMessage(message) {
      messages.push(structuredClone(message));
    },
    store: {
      async find(user) {
        return states.get(user) ?? null;
      },
      async claim(user, state, now) {
        const old = states.get(user);
        if (old?.ownerSocketId && old.ownerSocketId !== state.ownerSocketId && old.expiresAt! > now)
          return null;
        const saved = { _id: user, ...structuredClone(state) };
        states.set(user, saved);
        return saved;
      },
      async save(user, owner, state) {
        const matches = states.get(user)?.ownerSocketId === owner;
        if (matches) states.set(user, { _id: user, ...structuredClone(state) });
        return {
          acknowledged: true,
          matchedCount: matches ? 1 : 0,
          modifiedCount: matches ? 1 : 0,
          upsertedCount: 0,
          upsertedId: null,
        };
      },
    },
    emit: ((socket, event, payload) => events.push({ socket, event, payload })) as RadioEmit,
    media: {
      async credentials(id, socket, publish) {
        tokens.push({ id, socket, publish });
        return { id, token: 'test', url: 'wss://example.test' };
      },
      async close(id) {
        closed.push(id);
      },
      async remove(id, socket) {
        removed.push(`${id}:${socket}`);
      },
      ...mediaOverrides,
    },
    async resolveContact(_session, endpoint) {
      return { ...endpoint, name: endpoint.id };
    },
    async currentStation(_session, user) {
      return positions.get(user) ?? null;
    },
  });
  async function claim(
    user: string,
    endpoint: ChatEndpoint = { kind: 'driver', id: user },
    sessionId = 'session',
    socket = user,
  ) {
    await radio.observe(user, socket);
    await radio.claim(user, socket, { sessionId, endpoint: { ...endpoint, name: endpoint.id } });
  }
  function state(user: string): RadioTerminalState {
    return states.get(user)!;
  }
  return {
    radio,
    claim,
    state,
    positions,
    events,
    tokens,
    messages,
    closed,
    removed,
    advance(ms: number) {
      time += ms;
    },
  };
}

test('accepted call history excludes ringing time and is written once for both private endpoints', async () => {
  const f = fixture();
  await f.claim('driver');
  await f.claim('dispatcher', { kind: 'station', id: 'a' });
  await f.radio.start('driver', 'driver', { kind: 'station', id: 'a' });
  const id = f.state('driver').call!.id;
  f.advance(3500);
  await f.radio.accept('dispatcher', 'dispatcher', id);
  f.advance(4100);
  await f.radio.hangup('driver', 'driver', id);
  await f.radio.hangup('dispatcher', 'dispatcher', id);
  assert.deepEqual(
    f.messages.map((message) => message.system?.kind),
    ['call-ringing', 'call-started', 'call-ended'],
  );
  assert(
    f.messages.every(
      (message) =>
        message.sessionId === 'session' &&
        message.sender.id === 'driver' &&
        message.recipient.id === 'a' &&
        !message.audience,
    ),
  );
  const ended = f.messages[2].system;
  assert(ended?.kind === 'call-ended');
  assert.equal(ended.durationSeconds, 4);
  assert.equal(ended.recipientName, 'dispatcher (a)');
  assert.equal(f.messages[2].createdAt, new Date(8600).toISOString());
});

test('unanswered dispatcher calls are logged without claiming a connected duration', async () => {
  const f = fixture();
  await f.claim('a', { kind: 'station', id: 'a' });
  await f.claim('b', { kind: 'station', id: 'b' });
  await f.radio.start('a', 'a', { kind: 'station', id: 'b' });
  await f.radio.hangup('b', 'b', f.state('a').call!.id);
  assert.deepEqual(
    f.messages.map((message) => message.system?.kind),
    ['call-ringing', 'call-ended'],
  );
  const ended = f.messages[1].system;
  assert(ended?.kind === 'call-ended');
  assert.equal(ended.durationSeconds, null);
});

test('local RADIOSTOP logs capture its station and recipient endpoints without leaking to other areas', async () => {
  const f = fixture();
  await f.claim('origin', { kind: 'station', id: 'a' });
  await f.claim('local-driver');
  await f.claim('remote-driver');
  await f.claim('remote-station', { kind: 'station', id: 'b' });
  f.positions.set('local-driver', 'a');
  f.positions.set('remote-driver', 'b');
  await f.radio.startEmergency('origin', 'origin', 'station');
  assert.equal(f.messages.length, 1);
  const message = f.messages[0];
  assert.equal(message.recipient.kind, 'session');
  assert.equal(message.announcement, 'alarm');
  assert.deepEqual(message.audience, [
    { kind: 'station', id: 'a' },
    { kind: 'driver', id: 'local-driver' },
  ]);
  assert.equal(message.system?.kind, 'radiostop');
  assert.match(message.content, /origin \(a\).*a/);
});

test('global RADIOSTOP is one timestamped session alert with no local audience restriction', async () => {
  const f = fixture();
  await f.claim('driver');
  await f.radio.startEmergency('driver', 'driver', 'session');
  assert.equal(f.messages.length, 1);
  assert.equal(f.messages[0].audience, undefined);
  assert.equal(f.messages[0].recipient.kind, 'session');
  assert.equal(f.messages[0].createdAt, new Date(1000).toISOString());
  assert.match(f.messages[0].content, /Celá relácia/);
});

test('one tab owns voice; observers have no credentials and cannot accept or take over', async () => {
  const f = fixture();
  await f.claim('driver');
  await f.claim('dispatcher', { kind: 'station', id: 'a' });
  await f.radio.observe('driver', 'other-tab');
  await assert.rejects(f.claim('driver', undefined, 'session', 'other-tab'), /iná karta/);
  await f.radio.start('dispatcher', 'dispatcher', { kind: 'driver', id: 'driver' });
  await assert.rejects(f.radio.accept('driver', 'other-tab'), /aktivujte/);
  await f.radio.robloxAction('driver', 'session', 'answer');
  assert.equal(f.state('driver').call?.phase, 'connected');
  assert.equal(f.state('dispatcher').call?.phase, 'connected');
  assert.deepEqual(f.tokens.map((t) => t.socket).sort(), ['dispatcher', 'driver']);
  assert(!f.events.some((e) => e.socket === 'other-tab' && e.event === 'call:connected'));
  await f.radio.robloxAction('driver', 'session', 'hangup');
  assert.equal(f.state('dispatcher').call, null);
});

test('GSM-R calls the physical current station and rejects inter or unknown position', async () => {
  const f = fixture();
  await f.claim('driver');
  await f.claim('dispatcher', { kind: 'station', id: 'a' });
  await assert.rejects(f.radio.robloxAction('driver', 'session', 'call-dispatcher'), /Poloha/);
  f.positions.set('driver', 'a');
  await f.radio.robloxAction('driver', 'session', 'call-dispatcher');
  assert.equal(f.state('dispatcher').call?.incoming, true);
  await f.radio.accept('dispatcher', 'dispatcher');
  await assert.rejects(f.radio.start('driver', 'driver', { kind: 'station', id: 'a' }), /ukončite/);
  await f.radio.release('driver', 'driver');
  assert.equal(f.state('dispatcher').call, null);
  assert.equal(f.closed.length, 1);
});

test('emergencies interrupt only the originator normal call; listeners keep normal audio and receive multiple broadcasts', async () => {
  const f = fixture();
  await f.claim('a', { kind: 'station', id: 'a' });
  await f.claim('b', { kind: 'station', id: 'b' });
  await f.claim('c');
  await f.claim('d');
  await f.radio.start('a', 'a', { kind: 'driver', id: 'c' });
  await f.radio.accept('c', 'c');
  await f.radio.startEmergency('b', 'b', 'session');
  assert.equal(f.state('a').call?.phase, 'connected');
  assert.equal(f.state('c').call?.phase, 'connected');
  await f.radio.startEmergency('d', 'd', 'session');
  assert.equal(f.state('a').emergencies.length, 2);
  const emergencyTokens = f.tokens.filter(
    (t) => !f.state('a').call || t.id !== f.state('a').call!.id,
  );
  assert.equal(emergencyTokens.filter((t) => t.publish).length, 2);
  assert(
    emergencyTokens.filter((t) => t.socket === 'a' || t.socket === 'c').every((t) => !t.publish),
  );
  await f.radio.startEmergency('a', 'a', 'session');
  assert.equal(f.state('c').call, null);
  assert.equal(f.state('a').emergencies.length, 3);
  await assert.rejects(f.radio.start('a', 'a', { kind: 'driver', id: 'c' }), /ukončite/);
  await f.radio.robloxAction('d', 'session', 'emergency-stop');
  assert.equal(f.state('a').emergencies.length, 2);
});

test('station audience is captured at start, persists after movement, and resumes only for an original recipient', async () => {
  const f = fixture();
  await f.claim('station', { kind: 'station', id: 'a' });
  for (const driver of ['inside', 'outside', 'inter']) await f.claim(driver);
  f.positions.set('inside', 'a');
  f.positions.set('outside', 'b');
  await f.radio.startEmergency('station', 'station', 'station');
  const id = f.state('station').emergencies[0].id;
  assert.equal(f.state('inside').emergencies.length, 1);
  assert.equal(f.state('outside').emergencies.length, 0);
  assert.equal(f.state('inter').emergencies.length, 0);
  f.positions.set('inside', 'b');
  f.positions.set('outside', 'a');
  await f.radio.heartbeat('inside', 'inside');
  await f.radio.heartbeat('outside', 'outside');
  assert.equal(f.state('inside').emergencies.length, 1);
  assert.equal(f.state('outside').emergencies.length, 0);
  await f.radio.release('inside', 'inside');
  assert(f.removed.includes(`${id}:inside`));
  await f.claim('inside', undefined, 'session', 'replacement');
  assert(f.tokens.some((t) => t.id === id && t.socket === 'replacement' && !t.publish));
  await f.claim('late');
  f.positions.set('late', 'a');
  assert.equal(f.state('late').emergencies.length, 0);
  await f.radio.stopEmergency('outside', 'outside');
  assert.equal(f.state('inside').emergencies.length, 1);
  await f.radio.stopEmergency('station', 'station');
  assert.equal(f.state('inside').emergencies.length, 0);
  await assert.rejects(f.radio.startEmergency('inter', 'inter', 'station'), /známu polohu/);
});

test('heartbeat expiry ends a call and origin broadcasts and allows reclaim by the same or another tab', async () => {
  const f = fixture();
  await f.claim('driver');
  await f.claim('station', { kind: 'station', id: 'a' });
  await f.radio.start('driver', 'driver', { kind: 'station', id: 'a' });
  await f.radio.accept('station', 'station');
  f.advance(RADIO_LEASE_MS - 1);
  await f.radio.heartbeat('station', 'station');
  f.advance(2);
  await f.radio.tick();
  assert.equal(f.state('driver').ownerSocketId, null);
  assert.equal(f.state('station').call, null);
  await f.claim('driver');
  await f.radio.startEmergency('driver', 'driver', 'session');
  f.advance(RADIO_LEASE_MS + 1);
  // Claim before the periodic tick must also clean up the expired owner.
  await f.claim('driver');
  assert.equal(f.state('driver').emergencies.length, 0);
  assert.equal(f.state('driver').ownerSocketId, 'driver');
  await f.radio.release('driver', 'driver');
  await f.claim('driver', undefined, 'session', 'new-tab');
  assert.equal(f.state('driver').ownerSocketId, 'new-tab');
});

test('multiple station terminals ring; first answer wins and a different declined terminal cannot end the connected call', async () => {
  const f = fixture();
  await f.claim('driver');
  for (const dispatcher of ['s1', 's2', 's3'])
    await f.claim(dispatcher, { kind: 'station', id: 'a' });
  await f.radio.start('driver', 'driver', { kind: 'station', id: 'a' });
  await f.radio.disconnect('s3', 's3');
  assert.equal(f.state('driver').call?.phase, 'ringing');
  await f.radio.accept('s1', 's1');
  assert.equal(f.state('s2').call, null);
  await assert.rejects(f.radio.accept('s2', 's2', f.state('driver').call!.id), /dostupný/);
  await f.radio.hangup('s2', 's2', f.state('driver').call!.id);
  assert.equal(f.state('driver').call?.phase, 'connected');
  await f.claim('another-driver');
  await f.radio.start('s2', 's2', { kind: 'driver', id: 'another-driver' });
  await f.radio.accept('another-driver', 'another-driver');
  const separateCall = f.state('s2').call!.id;
  await f.radio.disconnect('s1', 's1');
  assert.equal(f.state('driver').call, null);
  assert.equal(f.state('s2').call!.id, separateCall);
  assert.equal(f.state('s2').notice, '');
});

test('session boundaries isolate normal calls, emergencies and Roblox actions', async () => {
  const f = fixture();
  await f.claim('driver');
  await f.claim('other', { kind: 'station', id: 'a' }, 'elsewhere');
  await assert.rejects(f.radio.start('driver', 'driver', { kind: 'station', id: 'a' }), /obsadené/);
  await assert.rejects(
    f.radio.robloxAction('driver', 'elsewhere', 'emergency-session'),
    /rovnakej/,
  );
  await f.radio.startEmergency('driver', 'driver', 'session');
  assert.equal(f.state('other').emergencies.length, 0);
  await f.radio.disconnect('driver', 'driver');
  assert.equal(f.closed.length, 1);
});

test('LiveKit emergency listener grants cannot publish audio, video, metadata or data', async () => {
  const previous = [
    process.env.LIVEKIT_URL,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
  ];
  process.env.LIVEKIT_URL = 'wss://example.test';
  process.env.LIVEKIT_API_KEY = 'test';
  process.env.LIVEKIT_API_SECRET = 'test-secret-is-at-least-32-characters';
  try {
    const receiver = await radioMedia.credentials('emergency', 'receiver', false);
    const origin = await radioMedia.credentials('emergency', 'origin', true);
    const grants = (token: string) =>
      JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).video;
    assert.equal(grants(receiver.token).canPublish, false);
    assert.equal(grants(receiver.token).canPublishData, false);
    assert.equal(grants(receiver.token).canUpdateOwnMetadata, false);
    assert.deepEqual(grants(origin.token).canPublishSources, ['microphone']);
    assert.equal(grants(origin.token).canPublish, true);
  } finally {
    for (const [index, key] of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'].entries()) {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    }
  }
});

test(
  'an unreachable media server cannot block lease release or heartbeats',
  { timeout: 1000 },
  async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const f = fixture({ close: () => pending, remove: () => pending });
    await f.claim('driver');
    await f.claim('station', { kind: 'station', id: 'a' });
    await f.radio.startEmergency('station', 'station', 'session');
    await f.radio.release('driver', 'driver');
    await f.radio.stopEmergency('station', 'station');
    await f.radio.heartbeat('station', 'station');
    assert.equal(f.state('driver').ownerSocketId, null);
    assert.equal(f.state('station').emergencies.length, 0);
    finish();
  },
);
