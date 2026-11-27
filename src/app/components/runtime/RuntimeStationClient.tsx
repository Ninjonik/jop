'use client';
import { apiFetch, apiOrigin } from '@/lib/api-client';
import { keepSocketConnected, socketReconnectOptions } from '@/lib/reconnect';

import { useTranslation } from '@/lib/i18n/client';

import { startTransition, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import type { StationDocument } from '@/lib/station/domain';
import type {
  StationRealtimeClientEvents,
  StationRealtimeServerEvents,
} from '@/lib/station/realtime';

import { useDispatcherFeedback } from '../ui/DispatcherFeedback';
import StationRuntimeBoard from './StationRuntimeBoard';

interface RuntimeStationClientProps {
  active?: boolean;
  embedded?: boolean;
  readOnly?: boolean;
  sessionId: string;
  stationId: string;
}

function getRouteStatus(station: StationDocument, t: ReturnType<typeof useTranslation>) {
  const selection = station.runtime.routeSelection;
  if (selection) {
    const routeType = selection.routeType === 'shunt' ? t('posunovej') : t('vlakovej');
    return selection.mode === 'build'
      ? t('Stavanie {0} cesty: začiatok je vybraný, vyberte koniec.', routeType)
      : t('Rušenie {0} cesty: začiatok je vybraný, vyberte koniec.', routeType);
  }

  const pendingRouteAction = Object.values(station.runtime.pendingActions).find((action) =>
    action.type.startsWith('route:'),
  );
  if (!pendingRouteAction) {
    return null;
  }

  const routeType = pendingRouteAction.type.endsWith('-shunt') ? t('posunovej') : t('vlakovej');
  return pendingRouteAction.type.includes(':cancel-')
    ? t('Rušenie {0} cesty…', routeType)
    : t('Stavanie {0} cesty…', routeType);
}

export default function RuntimeStationClient({
  sessionId,
  stationId,
  embedded = false,
  active = true,
  readOnly = false,
}: RuntimeStationClientProps) {
  const t = useTranslation();
  const feedback = useDispatcherFeedback();
  const setFeedback = feedback?.setFeedback;
  const realtimeSocket = useRef<Socket<
    StationRealtimeServerEvents,
    StationRealtimeClientEvents
  > | null>(null);
  const connections = useRef(0);
  const reconnectAttempts = useRef(0);
  const [station, setStation] = useState<StationDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStation() {
      try {
        setLoading(true);
        const response = await apiFetch(`/api/stations/${sessionId}/${stationId}`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as
          { station: StationDocument } | { error: { message: string } };

        if (!response.ok) {
          throw new Error('error' in payload ? payload.error.message : 'Failed to load station.');
        }

        if (!('station' in payload)) {
          throw new Error('Failed to load station.');
        }

        if (!active) {
          return;
        }

        startTransition(() => {
          setStation((current) =>
            !current || payload.station.revision >= current.revision ? payload.station : current,
          );
          setError(null);
          setLoading(false);
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        startTransition(() => {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load station.');
          setLoading(false);
        });
      }
    }

    void loadStation();

    return () => {
      active = false;
    };
  }, [sessionId, stationId]);

  useEffect(() => {
    const channel = new BroadcastChannel('jop-station-snapshots');
    channel.onmessage = (event: MessageEvent<StationDocument>) => {
      const nextStation = event.data;
      if (nextStation.sessionId !== sessionId || nextStation.stationId !== stationId) {
        return;
      }

      startTransition(() => {
        setStation((current) =>
          !current || nextStation.revision >= current.revision ? nextStation : current,
        );
        setError(null);
      });
    };

    return () => channel.close();
  }, [sessionId, stationId]);

  useEffect(() => {
    let active = true;
    const socket: Socket<StationRealtimeServerEvents, StationRealtimeClientEvents> = io(
      apiOrigin || undefined,
      {
        ...socketReconnectOptions,
        path: '/socket.io',
        transports: ['websocket'],
      },
    );

    const stopReconnecting = keepSocketConnected(socket);
    realtimeSocket.current = socket;
    socket.io.on('reconnect_attempt', () => {
      reconnectAttempts.current++;
    });
    socket.on('connect', () => {
      connections.current++;
      socket.emit('station:subscribe', {
        type: 'subscribe',
        sessionId,
        stationId,
      });
      setError(null);
    });

    socket.on('station:snapshot', (nextStation) => {
      if (!active || nextStation.sessionId !== sessionId || nextStation.stationId !== stationId)
        return;
      startTransition(() => {
        setLoading(false);
        setStation((current) =>
          !current || nextStation.revision >= current.revision ? nextStation : current,
        );
        setError(null);
      });
    });

    socket.on('station:error', (message) => {
      setError(message);
    });

    socket.on('connect_error', () => {
      setError('Realtime subscription disconnected.');
    });

    socket.on('disconnect', () => {
      if (active) {
        setError('Realtime subscription disconnected. Reconnecting...');
      }
    });

    return () => {
      active = false;
      stopReconnecting();
      realtimeSocket.current = null;
      socket.disconnect();
    };
  }, [sessionId, stationId]);

  useEffect(() => {
    if (station && !loading && realtimeSocket.current?.connected) {
      realtimeSocket.current.emit('station:rendered', {
        revision: station.revision,
        clientAt: new Date().toISOString(),
        reconnectCount: Math.max(0, connections.current - 1),
        reconnectAttempts: reconnectAttempts.current,
      });
    }
  }, [station, loading]);

  const routeStatus = station ? getRouteStatus(station, t) : null;
  const message = error ? t(error) : loading ? t('Loading station snapshot...') : routeStatus;
  useEffect(() => {
    if (!active || !setFeedback) return;
    setFeedback(message ? { message, error: Boolean(error) } : null);
    return () => setFeedback(null);
  }, [active, setFeedback, message, error]);

  return (
    <div
      className={`relative flex flex-col ${embedded ? 'flex-1 overflow-hidden min-h-0' : 'min-h-screen overflow-hidden'}`}
      aria-busy={loading}
    >
      {!feedback && (
        <div className="runtime-feedback" role="status" title={message || undefined}>
          {message}
        </div>
      )}
      {!station && (
        <div className="runtime-loading" role="status">
          {loading ? t('Loading station snapshot...') : t('Failed to load station.')}
        </div>
      )}
      {station && (
        <>
          {readOnly && (
            <p className="px-2 py-1 text-xs text-[var(--aero-text-muted)]">
              {t('Náhľad administrátora – ovládanie je vypnuté.')}
            </p>
          )}
          <div
            className={`flex flex-1 flex-col min-h-0 overflow-hidden ${readOnly ? 'pointer-events-none select-none' : ''}`}
          >
            <StationRuntimeBoard
              station={station}
              onErrorChange={(message) => {
                setError(message);
                if (message)
                  realtimeSocket.current?.emit('station:client-error', {
                    clientAt: new Date().toISOString(),
                  });
              }}
              onLineblockSnapshots={(localStation, remoteStation) => {
                startTransition(() => {
                  setStation((current) =>
                    !current || localStation.revision >= current.revision ? localStation : current,
                  );
                  setError(null);
                });
                const channel = new BroadcastChannel('jop-station-snapshots');
                channel.postMessage(remoteStation);
                channel.close();
              }}
              onStationSnapshot={(nextStation) => {
                startTransition(() => {
                  setStation((current) =>
                    !current || nextStation.revision >= current.revision ? nextStation : current,
                  );
                  setError(null);
                });
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}
