'use client';
import { useTranslation } from '@/lib/i18n/client';

import { startTransition, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import type { StationDocument } from '@/lib/station/domain';
import type {
  StationRealtimeClientEvents,
  StationRealtimeServerEvents,
} from '@/lib/station/realtime';

import StationRuntimeBoard from './StationRuntimeBoard';

interface RuntimeStationClientProps {
  embedded?: boolean;
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
}: RuntimeStationClientProps) {
  const t = useTranslation();
  const [station, setStation] = useState<StationDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStation() {
      try {
        setLoading(true);
        const response = await fetch(`/api/stations/${sessionId}/${stationId}`, {
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
          setStation(payload.station);
          setError(null);
        });
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load station.');
      } finally {
        if (active) {
          setLoading(false);
        }
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
        setStation(nextStation);
        setError(null);
      });
    };

    return () => channel.close();
  }, [sessionId, stationId]);

  useEffect(() => {
    let active = true;
    const socket: Socket<StationRealtimeServerEvents, StationRealtimeClientEvents> = io({
      path: '/socket.io',
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      socket.emit('station:subscribe', {
        type: 'subscribe',
        sessionId,
        stationId,
      });
      setError(null);
    });

    socket.on('station:snapshot', (nextStation) => {
      startTransition(() => {
        setStation(nextStation);
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
      socket.disconnect();
    };
  }, [sessionId, stationId]);

  if (loading) {
    return <p className="text-sm text-neutral-500">{t('Loading station snapshot...')}</p>;
  }

  if (error && !station) {
    return <p className="text-sm text-red-300">{t(error)}</p>;
  }

  if (!station) {
    return <p className="text-sm text-neutral-500">{t('Station not found.')}</p>;
  }

  const routeStatus = getRouteStatus(station, t);

  return (
    <div
      className={`flex flex-col ${embedded ? 'flex-1 overflow-hidden min-h-0' : 'min-h-screen overflow-hidden'}`}
    >
      {(error || routeStatus) && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-black">
          {error ? (
            <div className="flex-1 border border-red-700 bg-red-100 px-2 py-0.5 text-red-900">
              {t(error)}
            </div>
          ) : routeStatus ? (
            <div className="flex-1 border border-amber-700 bg-amber-100 px-2 py-0.5 text-amber-950">
              {t(routeStatus)}
            </div>
          ) : null}
        </div>
      )}

      <StationRuntimeBoard
        station={station}
        onErrorChange={setError}
        onLineblockSnapshots={(localStation, remoteStation) => {
          startTransition(() => {
            setStation(localStation);
            setError(null);
          });
          const channel = new BroadcastChannel('jop-station-snapshots');
          channel.postMessage(remoteStation);
          channel.close();
        }}
      />
    </div>
  );
}
