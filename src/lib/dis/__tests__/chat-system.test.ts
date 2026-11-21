import { translate } from '@/lib/i18n/translate';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chatConversationKey,
  driverChatDisplayName,
  sendChatSchema,
  type ChatMessage,
} from '../chat';
import { chatSystemText } from '../chat-system';

test('driver contact names prefer active trains, deduplicate and fall back after release', () => {
  const trains = [
    { userId: 'driver', trainType: 'R', trainNumber: '4984', expiresAt: 2000 },
    { userId: 'driver', trainType: 'Os', trainNumber: '10', expiresAt: 2000 },
    { userId: 'driver', trainType: 'R', trainNumber: '4984', expiresAt: 2000 },
    { userId: 'driver', trainType: 'R', trainNumber: '999', expiresAt: 500 },
    { userId: 'someone-else', trainType: 'R', trainNumber: '666', expiresAt: 2000 },
  ];
  assert.equal(driverChatDisplayName('driver', trains, 'Nickname', 1000), 'Os 10 / R 4984');
  assert.equal(driverChatDisplayName('driver', trains, 'Nickname', 2001), 'Nickname');
});

test('session alerts do not bleed into private conversation tabs', () => {
  const message: ChatMessage = {
    _id: 'event',
    sessionId: 'session',
    sender: { kind: 'station', id: 'a', name: 'A' },
    recipient: { kind: 'session', id: 'all', name: 'Celá relácia' },
    senderUserId: 'dispatcher',
    senderName: 'Dispatcher',
    content: '',
    createdAt: new Date().toISOString(),
  };
  assert.equal(chatConversationKey(message, { kind: 'station', id: 'b' }), 'session:all');
  message.recipient = { kind: 'station', id: 'b', name: 'B' };
  assert.equal(chatConversationKey(message, { kind: 'station', id: 'a' }), 'station:b');
  assert.equal(chatConversationKey(message, { kind: 'station', id: 'b' }), 'station:a');
});

test('call system entries translate and show minutes/seconds without changing names', () => {
  const event = {
    kind: 'call-ended' as const,
    eventId: 'call',
    callerName: 'Os 123',
    recipientName: 'Veselé',
    durationSeconds: 125,
    reason: 'Hovor bol ukončený.',
  };
  const text = chatSystemText(event, (text, ...values) => translate(text, 'en', ...values));
  assert.match(text, /Call ended: Os 123 ↔ Veselé/);
  assert.match(text, /Duration: 2:05/);
});

test('ordinary send commands cannot forge server system events or area audiences', () => {
  const command = sendChatSchema.parse({
    sessionId: 'session',
    endpoint: { kind: 'station', id: 'a' },
    recipient: { kind: 'session', id: 'all' },
    content: 'Test',
    messageId: 'e5475580-1f1c-460e-af07-7068a2c098fd',
    system: { kind: 'radiostop' },
    audience: [{ kind: 'station', id: 'a' }],
  });
  assert(!('system' in command));
  assert(!('audience' in command));
});
