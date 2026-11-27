import { allowedClientOrigin, handleCors } from '@/lib/server/cors';
import { flushSessionActivity, recordSessionActivity } from '@/lib/server/session-activity';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import sirv from 'sirv';

import type { ChatNamespace } from '@/lib/server/dis/chat-realtime';
import { loadEnvConfig } from '@next/env';
import type { ChangeStream, Collection } from 'mongodb';
import next from 'next';
import { Server } from 'socket.io';

import { stationDocumentSchema, type StationDocument } from '@/lib/station/domain';
import {
  getStationSubscriptionKey,
  stationRealtimeSubscribeSchema,
  type StationRealtimeClientEvents,
  type StationRealtimeServerEvents,
  type StationRealtimeSocketData,
} from '@/lib/station/realtime';

const development = process.argv.includes('--dev');
if (!process.env.NODE_ENV)
  Object.assign(process.env, { NODE_ENV: development ? 'development' : 'production' });
loadEnvConfig(process.cwd(), development);
const hostname = process.env.HOSTNAME ?? '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const httpServer = createServer();
const nextApp = next({ dir: resolve('apps/api'), dev: development, hostname, port, httpServer });
const requestHandler = nextApp.getRequestHandler();
const serveSpa = sirv(resolve('apps/spa/dist'), {
  single: true,
  dev: development,
  etag: true,
  setHeaders(response, pathname) {
    // Every application route is served by the SPA entry document. Revalidate
    // it on ordinary refreshes so a deployment immediately supplies the new
    // fingerprinted asset list. Assets themselves are content-addressed.
    response.setHeader(
      'Cache-Control',
      pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-cache, max-age=0, must-revalidate',
    );
  },
});

let stations: Collection<StationDocument>;
let stationChanges: ChangeStream<StationDocument> | null = null;
let shuttingDown = false;

function parseStation(value: unknown) {
  const parsed = stationDocumentSchema.safeParse(value);
  if (!parsed.success) {
    console.error('[realtime] Ignored invalid station document:', parsed.error.message);
    return null;
  }

  return parsed.data as StationDocument;
}

async function start() {
  await nextApp.prepare();
  httpServer.on('request', (request, response) => {
    if (handleCors(request, response)) return;
    const pathname = new URL(request.url || '/', 'http://localhost').pathname;
    if (pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
      void requestHandler(request, response);
    } else {
      serveSpa(request, response, () => {
        response.writeHead(404).end('SPA build missing. Run npm run build.');
      });
    }
  });

  const io = new Server<
    StationRealtimeClientEvents,
    StationRealtimeServerEvents,
    Record<string, never>,
    StationRealtimeSocketData
  >(httpServer, {
    path: '/socket.io',
    transports: ['websocket'],
    cors: {
      origin: (origin, callback) => callback(null, !origin || allowedClientOrigin(origin)),
      credentials: true,
    },
    allowRequest: (request, callback) =>
      callback(
        null,
        !request.headers.origin ||
          allowedClientOrigin(request.headers.origin, request.headers.host),
      ),
  });

  const { getMongoDb } = await import('@/lib/server/mongo');
  const database = await getMongoDb();
  stations = database.collection<StationDocument>('stations');
  const { startChatRealtime } = await import('@/lib/server/dis/chat-realtime');
  const stopChat = await startChatRealtime(io.of('/chat') as unknown as ChatNamespace);

  io.on('connection', (socket) => {
    socket.on('station:rendered', (receipt) => {
      if (
        !socket.data.stationRoom ||
        !receipt ||
        !Number.isSafeInteger(receipt.revision) ||
        receipt.revision < 0 ||
        receipt.revision <= (socket.data.lastRenderedRevision ?? -1) ||
        Date.now() - (socket.data.lastActivityAt ?? 0) < 100 ||
        typeof receipt.clientAt !== 'string' ||
        receipt.clientAt.length > 40 ||
        !Number.isSafeInteger(receipt.reconnectCount) ||
        !Number.isSafeInteger(receipt.reconnectAttempts) ||
        receipt.reconnectAttempts < 0
      )
        return;
      const [sessionId, stationId] = JSON.parse(socket.data.stationRoom) as [string, string];
      socket.data.lastRenderedRevision = receipt.revision;
      socket.data.lastActivityAt = Date.now();
      recordSessionActivity({
        sessionId,
        stationId,
        source: 'client',
        event: 'snapshot.rendered',
        level: 'info',
        revision: receipt.revision,
        details: {
          connectionId: socket.id,
          clientAt: receipt.clientAt,
          reconnectCount: receipt.reconnectCount,
          reconnectAttempts: receipt.reconnectAttempts,
          clientReported: true,
        },
      });
    });
    socket.on('station:client-error', (report) => {
      if (
        !socket.data.stationRoom ||
        !report ||
        typeof report.clientAt !== 'string' ||
        report.clientAt.length > 40 ||
        Date.now() - (socket.data.lastClientErrorAt ?? 0) < 1000
      )
        return;
      socket.data.lastClientErrorAt = Date.now();
      const [sessionId, stationId] = JSON.parse(socket.data.stationRoom) as [string, string];
      recordSessionActivity({
        sessionId,
        stationId,
        source: 'client',
        event: 'command.error-displayed',
        level: 'warning',
        details: { connectionId: socket.id, clientAt: report.clientAt, clientReported: true },
      });
    });
    socket.on('disconnect', (reason) => {
      if (!socket.data.stationRoom) return;
      const [sessionId, stationId] = JSON.parse(socket.data.stationRoom) as [string, string];
      recordSessionActivity({
        sessionId,
        stationId,
        source: 'server',
        event: 'client.disconnected',
        level: 'warning',
        details: { connectionId: socket.id, reason },
      });
    });
    socket.on('station:subscribe', (rawSubscription) => {
      void (async () => {
        const parsedSubscription = stationRealtimeSubscribeSchema.safeParse(rawSubscription);
        if (!parsedSubscription.success) {
          socket.emit('station:error', 'Invalid station subscription.');
          return;
        }

        const { sessionId, stationId } = parsedSubscription.data;
        const room = getStationSubscriptionKey(sessionId, stationId);
        if (socket.data.stationRoom) {
          await socket.leave(socket.data.stationRoom);
        }

        await socket.join(room);
        socket.data.stationRoom = room;
        socket.data.lastRenderedRevision = undefined;
        recordSessionActivity({
          sessionId,
          stationId,
          source: 'server',
          event: 'client.subscribed',
          level: 'info',
          details: { connectionId: socket.id },
        });

        const station = parseStation(await stations.findOne({ sessionId, stationId }));
        if (!station) {
          socket.emit('station:error', 'Station not found or invalid.');
          return;
        }

        socket.emit('station:snapshot', station);
      })().catch((error) => {
        console.error('[realtime] Failed to subscribe client:', error);
        socket.emit('station:error', 'Realtime subscription failed.');
      });
    });
  });

  async function refreshConnectedStations() {
    const subscriptions = new Map<string, { sessionId: string; stationId: string }>();
    io.sockets.sockets.forEach((socket) => {
      if (!socket.data.stationRoom) {
        return;
      }

      const [sessionId, stationId] = JSON.parse(socket.data.stationRoom) as [string, string];
      subscriptions.set(socket.data.stationRoom, { sessionId, stationId });
    });

    for (const [room, subscription] of subscriptions) {
      const station = parseStation(await stations.findOne(subscription));
      if (station) {
        io.to(room).emit('station:snapshot', station);
      }
    }
  }

  async function watchStations() {
    while (!shuttingDown) {
      try {
        stationChanges = stations.watch(
          [
            {
              $match: {
                operationType: { $in: ['insert', 'replace', 'update'] },
              },
            },
          ],
          { fullDocument: 'updateLookup' },
        );

        await refreshConnectedStations();

        for await (const change of stationChanges) {
          if (!('fullDocument' in change)) {
            continue;
          }

          if (!change.fullDocument) {
            continue;
          }

          const station = parseStation(change.fullDocument);
          if (!station) {
            continue;
          }

          const room = getStationSubscriptionKey(station.sessionId, station.stationId);
          io.to(room).emit('station:snapshot', station);
          recordSessionActivity({
            sessionId: station.sessionId,
            stationId: station.stationId,
            source: 'server',
            event: 'snapshot.broadcast',
            level: 'info',
            revision: station.revision,
            details: { subscribers: io.sockets.adapter.rooms.get(room)?.size ?? 0 },
          });
        }
      } catch (error) {
        if (shuttingDown) {
          return;
        }

        for (const socket of io.sockets.sockets.values()) {
          if (!socket.data.stationRoom) continue;
          const [sessionId, stationId] = JSON.parse(socket.data.stationRoom) as [string, string];
          recordSessionActivity({
            sessionId,
            stationId,
            source: 'server',
            event: 'realtime.retry',
            level: 'warning',
            details: { retryAfterMs: 1000 },
          });
        }
        console.error('[realtime] MongoDB change stream disconnected:', error);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } finally {
        stationChanges = null;
      }
    }
  }

  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await stationChanges?.close();
    await stopChat();
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => {
      if (!httpServer.listening) {
        resolve();
        return;
      }
      httpServer.close(() => resolve());
    });
    await flushSessionActivity();
  };

  const stopProcess = () => {
    void shutdown().finally(() => process.exit(0));
  };
  process.once('SIGINT', stopProcess);
  process.once('SIGTERM', stopProcess);

  httpServer.listen(port, hostname, () => {
    console.log(`[app] Listening on http://${hostname}:${port}`);
  });

  void watchStations();
}

void start().catch((error) => {
  console.error('[app] Failed to start:', error);
  process.exit(1);
});
