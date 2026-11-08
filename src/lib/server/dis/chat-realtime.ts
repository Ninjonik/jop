import type { UserProfile } from '@/lib/dis/appwrite-client';
import {
  chatEndpointKey,
  chatEndpointSchema,
  chatRoom,
  globalChatContact,
  type ChatClientEvents,
  type ChatMessage,
  type ChatServerEvents,
} from '@/lib/dis/chat';
import { AccessToken } from 'livekit-server-sdk';
import type { ChangeStream } from 'mongodb';
import { randomUUID } from 'node:crypto';
import type { Namespace } from 'socket.io';
import { requireDisProfile } from './appwrite';
import { authorizeChatScope, chatMessagesCollection, loadChat, resolveContact } from './chat';

type ChatSocketData = {
  profile: UserProfile;
  room?: string;
  scope?: { sessionId: string; endpoint: ChatMessage['sender'] };
};
export type ChatNamespace = Namespace<
  ChatClientEvents,
  ChatServerEvents,
  Record<string, never>,
  ChatSocketData
>;

export async function startChatRealtime(namespace: ChatNamespace) {
  const messages = await chatMessagesCollection();
  await Promise.all([
    messages.createIndex({
      sessionId: 1,
      'sender.kind': 1,
      'sender.id': 1,
      createdAt: -1,
      _id: -1,
    }),
    messages.createIndex({
      sessionId: 1,
      'recipient.kind': 1,
      'recipient.id': 1,
      createdAt: -1,
      _id: -1,
    }),
  ]);
  let stopped = false;
  let changes: ChangeStream<ChatMessage> | undefined;
  let markReady!: () => void;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  const profileFor = (token: unknown) =>
    requireDisProfile(
      new Request('http://localhost/api/dis/chat', {
        headers: { Authorization: typeof token === 'string' ? `Bearer ${token}` : '' },
      }),
    );
  namespace.use((socket, next) => {
    void profileFor(socket.handshake.auth.token)
      .then((profile) => {
        socket.data.profile = profile;
        next();
      })
      .catch(() => next(new Error('Prihláste sa znova do DIS.')));
  });
  type Call = {
    id: string;
    caller: string;
    recipients: string[];
    accepted?: string;
    timer: ReturnType<typeof setTimeout>;
  };
  const calls = new Map<string, Call>();
  const busy = (id: string) =>
    [...calls.values()].some((call) => call.caller === id || call.accepted === id);
  const endCall = (call: Call, reason: string) => {
    clearTimeout(call.timer);
    calls.delete(call.id);
    for (const id of [call.caller, ...call.recipients])
      namespace.to(id).emit('call:ended', { id: call.id, reason });
  };
  namespace.on('connection', (socket) => {
    socket.on('call:start', (rawRecipient) => {
      void (async () => {
        const scope = socket.data.scope;
        if (
          !scope ||
          busy(socket.id) ||
          [...calls.values()].some((call) => !call.accepted && call.recipients.includes(socket.id))
        )
          throw new Error('Hovor teraz nie je možné začať.');
        const recipient = chatEndpointSchema.parse(rawRecipient);
        if (
          chatEndpointKey(recipient) === chatEndpointKey(scope.endpoint) ||
          (scope.endpoint.kind === 'driver' && recipient.kind === 'driver')
        )
          throw new Error('Vyberte inú stanicu alebo rušňovodiča.');
        const profile = await profileFor(socket.handshake.auth.token);
        await authorizeChatScope(scope, profile);
        const contact = await resolveContact(scope.sessionId, recipient);
        if (!socket.connected || socket.data.scope !== scope || busy(socket.id)) return;
        const url = process.env.LIVEKIT_URL;
        if (!url || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET)
          throw new Error('Hlasové spojenie nie je nakonfigurované.');
        const targets = [
          ...(namespace.adapter.rooms.get(chatRoom(scope.sessionId, recipient)) || []),
        ].filter(
          (id) =>
            id !== socket.id &&
            !busy(id) &&
            ![...calls.values()].some((call) => !call.accepted && call.recipients.includes(id)),
        );
        if (!targets.length) throw new Error('Účastník nie je dostupný alebo má obsadené.');
        const id = randomUUID();
        const call: Call = {
          id,
          caller: socket.id,
          recipients: targets,
          timer: setTimeout(() => endCall(call, 'Účastník neodpovedá.'), 45000),
        };
        calls.set(id, call);
        socket.emit('call:ringing', { id, contact, incoming: false });
        for (const target of targets)
          namespace
            .to(target)
            .emit('call:ringing', { id, contact: scope.endpoint, incoming: true });
      })().catch((error) =>
        socket.emit(
          'call:error',
          error instanceof Error ? error.message : 'Hovor sa nepodarilo začať.',
        ),
      );
    });
    socket.on('call:accept', (id) => {
      void (async () => {
        const call = calls.get(id);
        if (!call || call.accepted || !call.recipients.includes(socket.id) || busy(socket.id))
          return;
        call.accepted = socket.id;
        clearTimeout(call.timer);
        for (const target of call.recipients.filter((target) => target !== socket.id))
          namespace
            .to(target)
            .emit('call:ended', { id, reason: 'Hovor bol prijatý na inom zariadení.' });
        const tokenFor = async (identity: string) => {
          const token = new AccessToken(
            process.env.LIVEKIT_API_KEY,
            process.env.LIVEKIT_API_SECRET,
            { identity, ttl: '10m' },
          );
          token.addGrant({
            roomJoin: true,
            room: `_jop_${id}`,
            canPublish: true,
            canSubscribe: true,
          });
          return token.toJwt();
        };
        const [callerToken, receiverToken] = await Promise.all([
          tokenFor(call.caller),
          tokenFor(socket.id),
        ]);
        if (!calls.has(id)) return;
        namespace
          .to(call.caller)
          .emit('call:connected', { id, url: process.env.LIVEKIT_URL!, token: callerToken });
        socket.emit('call:connected', { id, url: process.env.LIVEKIT_URL!, token: receiverToken });
      })().catch(() => {
        const call = calls.get(id);
        if (call) endCall(call, 'Spojenie sa nepodarilo vytvoriť.');
      });
    });
    socket.on('call:end', (id) => {
      const call = calls.get(id);
      if (
        call &&
        (call.caller === socket.id ||
          call.accepted === socket.id ||
          (!call.accepted && call.recipients.includes(socket.id)))
      )
        endCall(call, 'Hovor bol ukončený.');
    });
    socket.on('disconnect', () => {
      for (const call of calls.values())
        if (call.caller === socket.id || call.accepted === socket.id)
          endCall(call, 'Spojenie bolo prerušené.');
    });
    // Refresh credentials and role checks periodically, including idle connections.
    const expiration = setTimeout(() => socket.disconnect(), 10 * 60 * 1000);
    socket.on('disconnect', () => clearTimeout(expiration));
    socket.on('chat:subscribe', (rawScope) => {
      void (async () => {
        const profile = await profileFor(socket.handshake.auth.token);
        const scope = await authorizeChatScope(rawScope, profile);
        if (!socket.connected) return;
        for (const call of calls.values())
          if (
            call.caller === socket.id ||
            call.accepted === socket.id ||
            (!call.accepted && call.recipients.includes(socket.id))
          )
            endCall(call, 'Komunikácia bola prepnutá.');
        if (socket.data.room) await socket.leave(socket.data.room);
        if (socket.data.scope)
          await socket.leave(chatRoom(socket.data.scope.sessionId, globalChatContact));
        socket.data.profile = profile;
        socket.data.scope = { sessionId: scope.sessionId, endpoint: scope.contact };
        socket.data.room = chatRoom(scope.sessionId, scope.endpoint);
        await socket.join(socket.data.room);
        await socket.join(chatRoom(scope.sessionId, globalChatContact));
        // Join before history is read; clients merge by persisted message ID.
        socket.emit('chat:snapshot', await loadChat(rawScope, profile));
      })().catch((error) =>
        socket.emit(
          'chat:error',
          error instanceof Error ? error.message : 'Chat sa nepodarilo otvoriť.',
        ),
      );
    });
  });
  async function watch() {
    while (!stopped) {
      try {
        changes = messages.watch([{ $match: { operationType: 'insert' } }], {
          maxAwaitTimeMS: 1000,
        });
        // Open the cursor before accepting messages or restoring subscriber history.
        const first = await changes.tryNext();
        markReady();
        if (first?.operationType === 'insert') {
          const message = first.fullDocument;
          namespace
            .to(chatRoom(message.sessionId, message.sender))
            .to(chatRoom(message.sessionId, message.recipient))
            .emit('chat:message', message);
        }
        // Recover history after a change-stream restart instead of losing messages.
        for (const socket of namespace.sockets.values()) {
          if (!socket.data.scope) continue;
          try {
            socket.emit('chat:snapshot', await loadChat(socket.data.scope, socket.data.profile));
          } catch {
            socket.disconnect();
          }
        }
        for await (const change of changes) {
          if (change.operationType !== 'insert') continue;
          const message = change.fullDocument;
          namespace
            .to(chatRoom(message.sessionId, message.sender))
            .to(chatRoom(message.sessionId, message.recipient))
            .emit('chat:message', message);
        }
      } catch (error) {
        if (stopped) return;
        console.error('[chat] MongoDB change stream disconnected:', error);
        namespace.emit('chat:error', 'Obnovujem živé spojenie. Uložené správy sa načítajú znova.');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } finally {
        await changes?.close();
        changes = undefined;
      }
    }
  }
  void watch();
  await ready;
  return async () => {
    stopped = true;
    await changes?.close();
  };
}
