'use client';

import { startTransition, useEffect, useState } from 'react';

import type { StationDocument } from '@/lib/station/domain';

import StationRuntimeBoard from './StationRuntimeBoard';

interface RuntimeStationClientProps {
  sessionId: string;
  stationId: string;
}

export default function RuntimeStationClient({ sessionId, stationId }: RuntimeStationClientProps) {
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
          | { station: StationDocument }
          | { error: { message: string } };

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
    const eventSource = new EventSource(`/api/stations/${sessionId}/${stationId}/events`);

    eventSource.addEventListener('snapshot', (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as { station: StationDocument };
      startTransition(() => {
        setStation(payload.station);
      });
    });

    eventSource.onerror = () => {
      setError('Realtime subscription disconnected.');
    };

    return () => {
      eventSource.close();
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

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-neutral-300 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-black">
        <div className="border border-neutral-700 bg-white px-2 py-0.5">
          session: {sessionId}
        </div>
        <div className="border border-neutral-700 bg-white px-2 py-0.5">
          station: {stationId}
        </div>
        {error ? (
          <div className="border border-amber-700 bg-amber-100 px-2 py-0.5 text-amber-900">
            {error}
          </div>
        ) : null}
      </div>

      <StationRuntimeBoard station={station} error={error} onErrorChange={setError} />
    </div>
  );
}
