import type { UserProfile } from '@/lib/dis/appwrite-client';
import {
  chatRoom,
  type ChatClientEvents,
  type ChatMessage,
  type ChatServerEvents,
} from '@/lib/dis/chat';
import type { ChangeStream } from 'mongodb';
import type { Namespace } from 'socket.io';
import { requireDisProfile } from './appwrite';
import { authorizeChatScope, chatMessagesCollection, loadChat } from './chat';

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
  namespace.on('connection', (socket) => {
    // Refresh credentials and role checks periodically, including idle connections.
    const expiration = setTimeout(() => socket.disconnect(), 10 * 60 * 1000);
    socket.on('disconnect', () => clearTimeout(expiration));
    socket.on('chat:subscribe', (rawScope) => {
      void (async () => {
        const profile = await profileFor(socket.handshake.auth.token);
        const scope = await authorizeChatScope(rawScope, profile);
        if (!socket.connected) return;
        if (socket.data.room) await socket.leave(socket.data.room);
        socket.data.profile = profile;
        socket.data.scope = { sessionId: scope.sessionId, endpoint: scope.contact };
        socket.data.room = chatRoom(scope.sessionId, scope.endpoint);
        await socket.join(socket.data.room);
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
