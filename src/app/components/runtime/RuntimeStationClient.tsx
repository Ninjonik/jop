'use client';

import { startTransition, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import type { StationActionLogDocument, StationDocument } from '@/lib/station/domain';
import { getActionLogDebugLines } from '@/lib/station/debug';
import type {
  StationRealtimeClientEvents,
  StationRealtimeServerEvents,
} from '@/lib/station/realtime';

import StationRuntimeBoard from './StationRuntimeBoard';

interface RuntimeStationClientProps {
  sessionId: string;
  stationId: string;
}

function getRouteStatus(station: StationDocument) {
  const selection = station.runtime.routeSelection;
  if (selection) {
    const action = selection.mode === 'build' ? 'Building' : 'Cancelling';
    const routeType = selection.routeType === 'shunt' ? 'shunting' : 'normal';
    return `${action} ${routeType} route: source selected, choose the destination.`;
  }

  const pendingRouteAction = Object.values(station.runtime.pendingActions).find((action) =>
    action.type.startsWith('route:'),
  );
  if (!pendingRouteAction) {
    return null;
  }

  const action = pendingRouteAction.type.includes(':cancel-') ? 'Cancelling' : 'Building';
  const routeType = pendingRouteAction.type.endsWith('-shunt') ? 'shunting' : 'normal';
  return `${action} ${routeType} route...`;
}

export default function RuntimeStationClient({ sessionId, stationId }: RuntimeStationClientProps) {
  const [station, setStation] = useState<StationDocument | null>(null);
  const [actionLogs, setActionLogs] = useState<StationActionLogDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStation() {
      try {
        setLoading(true);
        const [response, actionsResponse] = await Promise.all([
          fetch(`/api/stations/${sessionId}/${stationId}`, {
            cache: 'no-store',
          }),
          fetch(`/api/stations/${sessionId}/${stationId}/actions`, {
            cache: 'no-store',
          }),
        ]);
        const payload = (await response.json()) as
          { station: StationDocument } | { error: { message: string } };
        const actionsPayload = (await actionsResponse.json()) as
          { actions: StationActionLogDocument[] } | { error?: { message?: string } };

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
          setActionLogs('actions' in actionsPayload ? actionsPayload.actions : []);
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
    let active = true;

    async function loadActions() {
      try {
        const response = await fetch(`/api/stations/${sessionId}/${stationId}/actions`, {
          cache: 'no-store',
        });
        const payload = (await response.json()) as
          { actions: StationActionLogDocument[] } | { error?: { message?: string } };
        if (!response.ok || !('actions' in payload) || !active) {
          return;
        }
        startTransition(() => {
          setActionLogs(payload.actions);
        });
      } catch {
        return;
      }
    }

    void loadActions();
    const interval = setInterval(() => {
      void loadActions();
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
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
    return <p className="text-sm text-neutral-500">Loading station snapshot...</p>;
  }

  if (error && !station) {
    return <p className="text-sm text-red-300">{error}</p>;
  }

  if (!station) {
    return <p className="text-sm text-neutral-500">Station not found.</p>;
  }

  const routeStatus = getRouteStatus(station);

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-neutral-300 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-black">
        <div className="border border-neutral-700 bg-white px-2 py-0.5">session: {sessionId}</div>
        <div className="border border-neutral-700 bg-white px-2 py-0.5">station: {stationId}</div>
        {error ? (
          <div className="flex-1 border border-red-700 bg-red-100 px-2 py-0.5 text-red-900">
            {error}
          </div>
        ) : routeStatus ? (
          <div className="flex-1 border border-amber-700 bg-amber-100 px-2 py-0.5 text-amber-950">
            {routeStatus}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
        <div className="min-w-0 flex-1">
          <StationRuntimeBoard station={station} onErrorChange={setError} />
        </div>
        <aside className="w-96 shrink-0 overflow-auto border border-neutral-700 bg-white p-3 text-sm text-black">
          <div className="mb-3 font-semibold">Web Debug Log</div>
          <div className="space-y-3">
            {actionLogs.length === 0 ? (
              <div className="text-neutral-500">No completed debug entries yet.</div>
            ) : (
              actionLogs.map((action) => {
                const debugLines = getActionLogDebugLines(action);
                return (
                  <div key={action._id} className="border border-neutral-300 p-2">
                    <div className="font-mono text-xs text-neutral-600">
                      {action.type} / {action.status}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      {action.finishedAt ?? action.startedAt ?? action.issuedAt}
                    </div>
                    <div className="mt-2 whitespace-pre-wrap font-mono text-xs">
                      {debugLines.length > 0
                        ? debugLines.map((line) => `- ${line}`).join('\n')
                        : '- No debug lines recorded'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
