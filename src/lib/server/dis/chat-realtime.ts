import type { UserProfile } from '@/lib/dis/appwrite-client';
import {
  chatEndpointSchema,
  chatRoom,
  globalChatContact,
  type ChatClientEvents,
  type ChatMessage,
  type ChatServerEvents,
} from '@/lib/dis/chat';
import type { StationClaim } from '@/lib/dis/claims';
import type { DriverTrain } from '@/lib/dis/driver-train';
import type { ChangeStream, ChangeStreamDocument } from 'mongodb';
import type { Namespace } from 'socket.io';
import { z } from 'zod';
import { getMongoDb } from '../mongo';
import { gsmRRepository } from '../repositories/gsm-r-repository';
import { radioTerminalRepository } from '../repositories/radio-terminal-repository';
import { sessionRepository } from '../repositories/session-repository';
import { isRobloxSessionLive } from '../services/station-service';
import { requireDisProfile } from './appwrite';
import { authorizeChatScope, chatMessagesCollection, loadChat, resolveContact } from './chat';
import { renewOperationClaims } from './claims';
import { RadioCalls, type RadioEmit } from './radio-calls';
import { driverRadioStation } from './radio-location';
import { assertVoiceConfigured, radioMedia } from './radio-media';
import { pruneSessionArtifacts } from './session-artifacts';

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
  let changes: ChangeStream<ChatMessage | DriverTrain | StationClaim> | undefined;
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
  // HTTP Roblox handlers and this custom server communicate through Mongo,
  // rather than relying on Next's separately bundled module instances.
  const radio = new RadioCalls({
    store: radioTerminalRepository,
    media: radioMedia,
    emit: ((id, event, ...args) => namespace.to(id).emit(event, ...args)) as RadioEmit,
    resolveContact,
    currentStation: driverRadioStation,
    actorName: (userId) =>
      [...namespace.sockets.values()].find((socket) => socket.data.profile.userId === userId)?.data
        .profile.name || 'Účastník',
    recordMessage: async (message) => {
      await messages.insertOne(message);
    },
  });
  let radioTail: Promise<unknown> = Promise.resolve();
  const enqueueRadio = <T>(operation: () => Promise<T>) => {
    const next = radioTail.catch(() => undefined).then(operation);
    radioTail = next;
    return next;
  };
  let ticking = false;
  let lastPrune = 0;
  const radioTimer = setInterval(() => {
    if (ticking || stopped) return;
    ticking = true;
    void enqueueRadio(async () => {
      await radio.tick(false);
      for (const command of await radioTerminalRepository.takeCommands()) {
        let failure: string | undefined;
        try {
          if (command.expiresAt <= Date.now())
            throw new Error('Požiadavka rádia vypršala. Skúste znova.');
          const session = await sessionRepository.findById(command.sessionId);
          if (!session || session.status !== 'active' || !isRobloxSessionLive(session))
            throw new Error('Aktívna Roblox relácia neexistuje.');
          const vehicle = (await gsmRRepository.list(command.sessionId)).find(
            (vehicle) => vehicle.sensorId === command.sensorId,
          );
          if (
            vehicle?.binding?.userId !== command.userId ||
            vehicle.binding.driverId !== command.actorUserId
          )
            throw new Error('Registrácia rádia sa zmenila.');
          await radio.robloxAction(command.userId, command.sessionId, command.action);
        } catch (error) {
          failure = error instanceof Error ? error.message : 'Požiadavka rádia zlyhala.';
          await radio.notice(command.userId, failure);
        }
        await radioTerminalRepository.finishCommand(command._id, failure);
      }
      if (Date.now() - lastPrune > 60000) {
        lastPrune = Date.now();
        await radioTerminalRepository.pruneCommands(lastPrune);
        await pruneSessionArtifacts();
      }
    })
      .catch((error) => console.error('[radio] Synchronization failed:', error))
      .finally(() => {
        ticking = false;
      });
  }, 500);
  const presenceTimer = setInterval(() => namespace.emit('radio:heartbeat-request'), 5000);
  namespace.on('connection', (socket) => {
    void enqueueRadio(() => radio.observe(socket.data.profile.userId, socket.id)).catch(() =>
      socket.disconnect(),
    );
    const action = (operation: () => Promise<unknown>) => {
      void enqueueRadio(async () => {
        const scope = socket.data.scope;
        if (!scope || !socket.connected) throw new Error('Najprv otvorte komunikáciu relácie.');
        const profile = await profileFor(socket.handshake.auth.token);
        await authorizeChatScope(scope, profile);
        if (!socket.connected || socket.data.scope !== scope)
          throw new Error('Komunikácia bola prepnutá.');
        await operation();
      }).catch((error) =>
        socket.emit(
          'call:error',
          error instanceof Error ? error.message : 'Hlasová požiadavka zlyhala.',
        ),
      );
    };
    socket.on('radio:status', () => {
      void enqueueRadio(() => radio.observe(socket.data.profile.userId, socket.id)).catch(() =>
        socket.disconnect(),
      );
    });
    socket.on('radio:claim', () =>
      action(async () => {
        assertVoiceConfigured();
        await radio.claim(socket.data.profile.userId, socket.id, socket.data.scope!);
      }),
    );
    socket.on('radio:release', () =>
      action(() => radio.release(socket.data.profile.userId, socket.id)),
    );
    socket.on('radio:heartbeat', () => {
      void enqueueRadio(async () => {
        if (socket.data.scope)
          await renewOperationClaims(socket.data.scope.sessionId, socket.data.profile.userId);
        const terminal = await radioTerminalRepository.find(socket.data.profile.userId);
        if (terminal?.ownerSocketId === socket.id)
          await radio.heartbeat(socket.data.profile.userId, socket.id);
      }).catch(() => undefined);
    });
    socket.on('call:start', (recipient) =>
      action(() =>
        radio.start(socket.data.profile.userId, socket.id, chatEndpointSchema.parse(recipient)),
      ),
    );
    socket.on('call:accept', (id) =>
      action(() => radio.accept(socket.data.profile.userId, socket.id, z.uuid().parse(id))),
    );
    socket.on('call:end', (id) =>
      action(() => radio.hangup(socket.data.profile.userId, socket.id, z.uuid().parse(id))),
    );
    socket.on('radio:emergency-start', (scope) =>
      action(() =>
        radio.startEmergency(
          socket.data.profile.userId,
          socket.id,
          z.enum(['session', 'station']).parse(scope),
        ),
      ),
    );
    socket.on('radio:emergency-stop', () =>
      action(() => radio.stopEmergency(socket.data.profile.userId, socket.id)),
    );
    socket.on('radio:emergency-failed', (id) =>
      action(() =>
        radio.emergencyFailed(socket.data.profile.userId, socket.id, z.uuid().parse(id)),
      ),
    );
    socket.on('disconnect', () => {
      void enqueueRadio(() => radio.disconnect(socket.data.profile.userId, socket.id)).catch(
        (error) => console.error('[radio] Disconnect cleanup failed:', error),
      );
    });
    // Refresh credentials and role checks periodically, including idle connections.
    let expiration = setTimeout(() => socket.disconnect(), 10 * 60 * 1000);
    socket.on('chat:refresh-auth', (token) => {
      void (async () => {
        const profile = await profileFor(token);
        if (profile.userId !== socket.data.profile.userId) throw new Error('Identity changed');
        if (socket.data.scope) await authorizeChatScope(socket.data.scope, profile);
        socket.handshake.auth.token = token;
        socket.data.profile = profile;
        clearTimeout(expiration);
        expiration = setTimeout(() => socket.disconnect(), 10 * 60 * 1000);
      })().catch(() => socket.disconnect());
    });
    socket.on('disconnect', () => clearTimeout(expiration));
    socket.on('chat:subscribe', (rawScope) => {
      void (async () => {
        const profile = await profileFor(socket.handshake.auth.token);
        const scope = await authorizeChatScope(rawScope, profile);
        if (!socket.connected) return;
        await enqueueRadio(() => radio.changeScope(profile.userId, socket.id));
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
  async function refreshChatSnapshots() {
    for (const socket of namespace.sockets.values()) {
      if (!socket.data.scope) continue;
      try {
        socket.emit('chat:snapshot', await loadChat(socket.data.scope, socket.data.profile));
      } catch {
        socket.disconnect();
      }
    }
  }
  async function publishChatChange(
    change: ChangeStreamDocument<ChatMessage | DriverTrain | StationClaim>,
  ) {
    if (!('ns' in change) || !('coll' in change.ns)) return;
    if (['session_driver_trains', 'session_station_claims'].includes(change.ns.coll)) {
      if (
        change.operationType === 'update' &&
        Object.keys(change.updateDescription.updatedFields || {}).every(
          (key) => key === 'expiresAt',
        )
      )
        return;
      // Deletes have no full document/session ID, so refresh subscribed inboxes.
      // This does not resubscribe or release an active voice terminal.
      await refreshChatSnapshots();
    } else if (
      ['insert', 'update', 'replace'].includes(change.operationType) &&
      'fullDocument' in change &&
      change.fullDocument &&
      'sender' in change.fullDocument
    ) {
      const message = change.fullDocument;
      namespace
        .to(
          (message.audience ?? [message.sender, message.recipient]).map((endpoint) =>
            chatRoom(message.sessionId, endpoint),
          ),
        )
        .emit('chat:message', message);
    }
  }
  async function watch() {
    while (!stopped) {
      try {
        changes = (await getMongoDb()).watch<ChatMessage | DriverTrain | StationClaim>(
          [
            {
              $match: {
                $or: [
                  {
                    'ns.coll': 'session_chat_messages',
                    operationType: { $in: ['insert', 'update', 'replace'] },
                  },
                  {
                    'ns.coll': { $in: ['session_driver_trains', 'session_station_claims'] },
                    operationType: { $in: ['insert', 'update', 'replace', 'delete'] },
                  },
                ],
              },
            },
          ],
          { maxAwaitTimeMS: 1000, fullDocument: 'updateLookup' },
        );
        // Open the cursor before accepting messages or restoring subscriber history.
        const first = await changes.tryNext();
        markReady();
        if (first) await publishChatChange(first);
        // Recover history after a change-stream restart instead of losing messages.
        await refreshChatSnapshots();
        for await (const change of changes) await publishChatChange(change);
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
    clearInterval(radioTimer);
    clearInterval(presenceTimer);
    await enqueueRadio(() => radio.stop());
    await changes?.close();
  };
}
