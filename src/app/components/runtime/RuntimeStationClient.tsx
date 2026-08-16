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
    <div className="space-y-4">
      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-neutral-100">Revision {station.revision}</div>
            <div className="text-xs text-neutral-500">Updated {station.updatedAt}</div>
          </div>
          {error ? <div className="text-xs text-amber-300">{error}</div> : null}
        </div>
      </section>

      <StationRuntimeBoard
        station={station}
      />
    </div>
  );
}
