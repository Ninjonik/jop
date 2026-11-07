/** Actual HTTP + Socket.IO delivery, with real Mongo/Appwrite fixture persistence. */
import { Account, AppwriteException } from 'node-appwrite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mock } from 'node:test';
import { Server } from 'socket.io';
import { io, type Socket } from 'socket.io-client';
import { GET, POST } from '../src/app/api/dis/chat/route';
import type { UserProfile } from '../src/lib/dis/appwrite-client';
import type { ChatMessage, ChatSnapshot } from '../src/lib/dis/chat';
import { databaseId, disDatabase } from '../src/lib/server/dis/appwrite';
import { startChatRealtime, type ChatNamespace } from '../src/lib/server/dis/chat-realtime';
import { getMongoClient, getMongoDb } from '../src/lib/server/mongo';
import { stationService } from '../src/lib/server/services/station-service';

const tag = `chatqa${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const staff: UserProfile[] = ['dispatcher', 'driver', 'driver'].map((role, index) => ({
  userId: `${tag}-${index}`,
  name: `${tag} ${index}`,
  role: role as UserProfile['role'],
  callsign: 'QA',
  trainingStage: 'certified',
  strikes: 0,
}));
const auth = mock.method(Account.prototype, 'get', async function (this: Account) {
  const id = this.client.config.jwt;
  if (!staff.some((person) => person.userId === id))
    throw new AppwriteException('Unauthorized', 401);
  return { $id: id };
});
const clients: Socket[] = [];
const sessions: string[] = [];
const profiles: string[] = [];
const http = createServer((request, response) => {
  void (async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const req = new Request(`http://localhost${request.url}`, {
      method: request.method,
      headers: {
        Authorization: request.headers.authorization || '',
        'Content-Type': 'application/json',
      },
      body: request.method === 'POST' ? Buffer.concat(chunks).toString() : undefined,
    });
    const result = request.method === 'POST' ? await POST(req) : await GET(req);
    response.writeHead(result.status, { 'Content-Type': 'application/json' });
    response.end(await result.text());
  })().catch((error) => {
    console.error(error);
    response.writeHead(500).end();
  });
});
const sockets = new Server(http, { transports: ['websocket'] });
let stopChat: (() => Promise<void>) | undefined;
let base = '';

function once<T>(socket: Socket, event: string) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out: ${event}`));
    }, 8000);
    function listener(value: T) {
      clearTimeout(timeout);
      resolve(value);
    }
    socket.once(event, listener);
  });
}
async function connect(
  sessionId: string,
  kind: 'station' | 'driver',
  id: string,
  userId = staff[0].userId,
) {
  const socket = io(`${base}/chat`, {
    transports: ['websocket'],
    auth: { token: userId },
    forceNew: true,
    autoConnect: false,
  });
  clients.push(socket);
  const snapshot = once<ChatSnapshot>(socket, 'chat:snapshot');
  socket.on('connect', () => socket.emit('chat:subscribe', { sessionId, endpoint: { kind, id } }));
  socket.connect();
  return { socket, snapshot: await snapshot };
}
async function post(body: unknown, userId = staff[0].userId, status = 200) {
  const response = await fetch(`${base}/api/dis/chat`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userId}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, status, JSON.stringify(result));
  return result;
}
async function verify() {
  for (const profile of staff) {
    await disDatabase().createDocument(databaseId, 'profiles', profile.userId, profile);
    profiles.push(profile.userId);
  }
  for (let index = 0; index < 2; index++) {
    const session = await stationService.createMockSession();
    sessions.push(session._id);
    for (const station of ['a', 'b', 'c']) await stationService.createStation(session._id, station);
  }
  stopChat = await startChatRealtime(sockets.of('/chat') as unknown as ChatNamespace);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  assert(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}`;
  const a = await connect(sessions[0], 'station', 'a');
  const b = await connect(sessions[0], 'station', 'b');
  const c = await connect(sessions[0], 'station', 'c');
  const driver = await connect(sessions[0], 'driver', staff[1].userId, staff[1].userId);
  const otherSession = await connect(sessions[1], 'station', 'b');
  const unexpected: ChatMessage[] = [];
  for (const client of [c, driver, otherSession])
    client.socket.on('chat:message', (message) => unexpected.push(message));
  const command = {
    sessionId: sessions[0],
    endpoint: { kind: 'station', id: 'a' },
    recipient: { kind: 'station', id: 'b' },
    content: 'Stanica A volá B',
    messageId: randomUUID(),
  };
  const received = once<ChatMessage>(b.socket, 'chat:message');
  const sent = await post(command);
  assert.equal((await received)._id, sent.message._id);
  const mongo = await getMongoDb();
  assert.equal(
    (await mongo.collection('session_chat_messages').findOne({ _id: sent.message._id as never }))
      ?.content,
    command.content,
  );
  assert.equal((await post(command)).message._id, sent.message._id, 'Retries deduplicate');
  await post({ ...command, content: 'Different' }, staff[0].userId, 409);
  assert.equal(
    unexpected.length,
    0,
    'Other stations, drivers and sessions must not receive the conversation',
  );
  driver.socket.off('chat:message');
  const direct = {
    ...command,
    recipient: { kind: 'driver', id: staff[1].userId },
    content: 'Volám rušňovodiča',
    messageId: randomUUID(),
  };
  const directReceived = once<ChatMessage>(driver.socket, 'chat:message');
  await post(direct);
  assert.equal((await directReceived).recipient.id, staff[1].userId);
  const replyReceived = once<ChatMessage>(a.socket, 'chat:message');
  await post(
    {
      ...direct,
      endpoint: direct.recipient,
      recipient: command.endpoint,
      content: 'Rušňovodič odpovedá',
      messageId: randomUUID(),
      senderName: 'spoof',
    },
    staff[1].userId,
  );
  assert.equal((await replyReceived).senderName, staff[1].name);
  await post({ ...command, messageId: randomUUID() }, staff[1].userId, 403);
  await post(
    {
      ...direct,
      endpoint: { kind: 'driver', id: staff[2].userId },
      recipient: command.endpoint,
      messageId: randomUUID(),
    },
    staff[1].userId,
    403,
  );
  await post(
    { ...command, recipient: { kind: 'station', id: 'missing' }, messageId: randomUUID() },
    staff[0].userId,
    404,
  );
  driver.socket.disconnect();
  const offline = await post({
    ...direct,
    content: 'Správa počas odpojenia',
    messageId: randomUUID(),
  });
  const reconnected = await connect(sessions[0], 'driver', staff[1].userId, staff[1].userId);
  assert(reconnected.snapshot.messages.some((message) => message._id === offline.message._id));
  assert(
    !reconnected.snapshot.messages.some((message) => message._id === sent.message._id),
    'A driver cannot read station-to-station traffic',
  );
  const denied = io(`${base}/chat`, {
    transports: ['websocket'],
    auth: { token: 'invalid' },
    forceNew: true,
    autoConnect: false,
  });
  clients.push(denied);
  const deniedResult = once<Error>(denied, 'connect_error');
  denied.connect();
  assert((await deniedResult).message.includes('DIS'));
  console.log(
    'HTTP and WebSocket chat: live station/driver replies, persistence, private routing, session isolation, reconnect history, auth and idempotency passed.',
  );
}
async function main() {
  try {
    await verify();
  } finally {
    clients.forEach((client) => client.disconnect());
    await stopChat?.();
    await new Promise<void>((resolve) => sockets.close(() => resolve()));
    auth.mock.restore();
    const mongo = await getMongoDb();
    for (const collection of ['stations', 'station_actions', 'session_chat_messages'])
      await mongo.collection(collection).deleteMany({ sessionId: { $in: sessions } });
    await mongo.collection('sessions').deleteMany({ _id: { $in: sessions } as never });
    for (const id of profiles) await disDatabase().deleteDocument(databaseId, 'profiles', id);
    await (await getMongoClient()).close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
