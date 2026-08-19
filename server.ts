import { createServer } from 'node:http';

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

loadEnvConfig(process.cwd());

const development = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME ?? '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const httpServer = createServer();
const nextApp = next({ dev: development, hostname, port, httpServer });
const requestHandler = nextApp.getRequestHandler();

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
  httpServer.on('request', requestHandler);

  const io = new Server<
    StationRealtimeClientEvents,
    StationRealtimeServerEvents,
    Record<string, never>,
    StationRealtimeSocketData
  >(httpServer, {
    path: '/socket.io',
    transports: ['websocket'],
  });

  const { getMongoDb } = await import('@/lib/server/mongo');
  const database = await getMongoDb();
  stations = database.collection<StationDocument>('stations');

  io.on('connection', (socket) => {
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
        }
      } catch (error) {
        if (shuttingDown) {
          return;
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
    io.close();
    httpServer.close();
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  httpServer.listen(port, hostname, () => {
    console.log(`[app] Listening on http://${hostname}:${port}`);
  });

  void watchStations();
}

void start().catch((error) => {
  console.error('[app] Failed to start:', error);
  process.exit(1);
});
