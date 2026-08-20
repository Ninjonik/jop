'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import type {
  MockTrain,
  SessionDocument,
  SessionSchemaDocument,
  StationDocument,
} from '@/lib/station/domain';
import { getPieceAnchor } from '@/lib/station/layout';

type OutboundCall = {
  type: 'session:changed';
  sessionId: string;
  issuedAt: string;
};

function getOccupationSensorPieceIds(station: StationDocument): string[] {
  return Object.entries(station.layout.pieces)
    .filter(([, piece]) => Boolean(piece.state.groups.occupation))
    .map(([pieceId]) => pieceId)
    .sort();
}

function getSpawnOptionLabel(station: StationDocument, pieceId: string) {
  const piece = station.layout.pieces[pieceId];
  const anchor = getPieceAnchor(station.layout, pieceId);
  return `${pieceId} (${anchor.x}.${anchor.y})${piece ? ` / ${piece.type}` : ''}`;
}

export default function MockControlClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdFromUrl = searchParams.get('sessionId')?.trim() ?? '';
  const [session, setSession] = useState<SessionDocument | null>(null);
  const [stations, setStations] = useState<StationDocument[]>([]);
  const [outboundCalls, setOutboundCalls] = useState<OutboundCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionIdDraft, setSessionIdDraft] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [trainDraft, setTrainDraft] = useState({
    category: 'Os',
    number: '8001',
    length: '1',
    stationId: '',
    pieceId: '',
    direction: 'left-to-right' as MockTrain['direction'],
  });
  const sessionSchemaInputRef = useRef<HTMLInputElement | null>(null);

  const trainStation = useMemo(
    () => stations.find((station) => station.stationId === trainDraft.stationId) ?? null,
    [stations, trainDraft.stationId],
  );

  function openSession(nextSessionId: string) {
    router.replace(`/mock?sessionId=${encodeURIComponent(nextSessionId)}`);
  }

  async function refreshSession(nextSessionId: string) {
    const [sessionResponse, stationsResponse, outboundResponse] = await Promise.all([
      fetch(`/api/sessions/${nextSessionId}`, { cache: 'no-store' }),
      fetch(`/api/sessions/${nextSessionId}/stations`, { cache: 'no-store' }),
      fetch(`/api/mock-roblox/outbound-calls?sessionId=${nextSessionId}`, { cache: 'no-store' }),
    ]);

    const sessionPayload = (await sessionResponse.json()) as
      { session: SessionDocument } | { error?: { message?: string } };
    const stationsPayload = (await stationsResponse.json()) as
      { stations: StationDocument[] } | { error?: { message?: string } };
    const outboundPayload = (await outboundResponse.json()) as { calls: OutboundCall[] };

    if (!sessionResponse.ok || !('session' in sessionPayload)) {
      throw new Error(
        'error' in sessionPayload
          ? (sessionPayload.error?.message ?? 'Failed to load session.')
          : 'Failed to load session.',
      );
    }

    if (!stationsResponse.ok || !('stations' in stationsPayload)) {
      throw new Error(
        'error' in stationsPayload
          ? (stationsPayload.error?.message ?? 'Failed to load session stations.')
          : 'Failed to load session stations.',
      );
    }

    setSession(sessionPayload.session);
    setStations(stationsPayload.stations);
    setOutboundCalls(outboundPayload.calls);

    setTrainDraft((current) => {
      const stationId = current.stationId || stationsPayload.stations[0]?.stationId || '';
      const station = stationsPayload.stations.find((entry) => entry.stationId === stationId);
      return {
        ...current,
        stationId,
        pieceId:
          current.pieceId || (station ? (getOccupationSensorPieceIds(station)[0] ?? '') : ''),
      };
    });
  }

  const refreshSessionEvent = useEffectEvent(async (nextSessionId: string) => {
    await refreshSession(nextSessionId);
  });

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        if (!sessionIdFromUrl) {
          if (!active) {
            return;
          }

          setSession(null);
          setStations([]);
          setOutboundCalls([]);
          setError(null);
          return;
        }

        await refreshSessionEvent(sessionIdFromUrl);
        if (active) {
          setError(null);
        }
      } catch (bootstrapError) {
        if (!active) {
          return;
        }

        setError(
          bootstrapError instanceof Error ? bootstrapError.message : 'Failed to load mock session.',
        );
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [sessionIdFromUrl]);

  useEffect(() => {
    if (!session?._id) {
      return;
    }

    const interval = setInterval(() => {
      void refreshSessionEvent(session._id).catch(() => undefined);
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [session?._id]);

  async function createTrain() {
    if (!session?._id) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(`/api/sessions/${session._id}/trains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...trainDraft,
          length: Number(trainDraft.length),
        }),
      });
      const payload = (await response.json()) as
        { train: MockTrain } | { error?: { message?: string } };
      if (!response.ok || !('train' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Failed to create train.')
            : 'Failed to create train.',
        );
      }
      await refreshSession(session._id);
      setError(null);
    } catch (trainError) {
      setError(trainError instanceof Error ? trainError.message : 'Failed to create train.');
    } finally {
      setIsBusy(false);
    }
  }

  async function moveTrain(trainId: string) {
    if (!session?._id) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(`/api/sessions/${session._id}/trains/${trainId}/move`, {
        method: 'POST',
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to move train.');
      }
      await refreshSession(session._id);
      setError(null);
    } catch (trainError) {
      setError(trainError instanceof Error ? trainError.message : 'Failed to move train.');
    } finally {
      setIsBusy(false);
    }
  }

  async function reverseTrain(trainId: string) {
    if (!session?._id) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(`/api/sessions/${session._id}/trains/${trainId}/reverse`, {
        method: 'POST',
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to reverse train.');
      }
      await refreshSession(session._id);
      setError(null);
    } catch (trainError) {
      setError(trainError instanceof Error ? trainError.message : 'Failed to reverse train.');
    } finally {
      setIsBusy(false);
    }
  }

  async function removeTrain(trainId: string) {
    if (!session?._id) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(`/api/sessions/${session._id}/trains/${trainId}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? 'Failed to remove train.');
      }
      await refreshSession(session._id);
      setError(null);
    } catch (trainError) {
      setError(trainError instanceof Error ? trainError.message : 'Failed to remove train.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImportSessionSchema(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsBusy(true);
    try {
      const schema = JSON.parse(await file.text()) as SessionSchemaDocument;
      const response = await fetch('/api/sessions/schema', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(schema),
      });
      const payload = (await response.json()) as
        { session: SessionDocument } | { error?: { message?: string } };
      if (!response.ok || !('session' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Failed to import session schema.')
            : 'Failed to import session schema.',
        );
      }
      openSession(payload.session._id);
      setError(null);
    } catch (schemaError) {
      setError(
        schemaError instanceof Error ? schemaError.message : 'Failed to import session schema.',
      );
    } finally {
      event.target.value = '';
      setIsBusy(false);
    }
  }

  function handleOpenExistingSession() {
    if (!sessionIdDraft.trim()) {
      return;
    }

    openSession(sessionIdDraft.trim());
  }

  if (!sessionIdFromUrl) {
    return (
      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <div className="text-sm text-neutral-400">
          Open a prepared session for simulation, or import a saved session schema.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,240px)_auto]">
          <input
            value={sessionIdDraft}
            onChange={(event) => setSessionIdDraft(event.target.value)}
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-amber-400"
            placeholder="mock-ab12cd34"
          />
          <button
            type="button"
            disabled={!sessionIdDraft.trim()}
            onClick={handleOpenExistingSession}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Open Session
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href="/map"
            className="rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-neutral-950"
          >
            Open Map Editor
          </Link>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => sessionSchemaInputRef.current?.click()}
            className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Import Session Schema
          </button>
        </div>
        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
        <input
          ref={sessionSchemaInputRef}
          type="file"
          accept="application/json"
          onChange={(event) => void handleImportSessionSchema(event)}
          className="hidden"
        />
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-neutral-400">
            {session ? `Mock session ${session._id} active.` : 'Loading mock session...'}
          </div>
          {session ? (
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/map?sessionId=${encodeURIComponent(session._id)}`}
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white"
              >
                Open Map Editor
              </Link>
              <Link
                href="/editor"
                className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white"
              >
                Open Station Editor
              </Link>
            </div>
          ) : null}
        </div>
        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Mock Trains
        </h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-6">
          <input
            value={trainDraft.category}
            onChange={(event) =>
              setTrainDraft((current) => ({ ...current, category: event.target.value }))
            }
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            placeholder="Category (Os, R)"
          />
          <input
            value={trainDraft.number}
            onChange={(event) =>
              setTrainDraft((current) => ({ ...current, number: event.target.value }))
            }
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            placeholder="Number"
          />
          <input
            type="number"
            min="1"
            max="100"
            value={trainDraft.length}
            onChange={(event) =>
              setTrainDraft((current) => ({ ...current, length: event.target.value }))
            }
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
            aria-label="Train length in occupation sensors"
          />
          <select
            value={trainDraft.stationId}
            onChange={(event) => {
              const stationId = event.target.value;
              const station = stations.find((entry) => entry.stationId === stationId);
              setTrainDraft((current) => ({
                ...current,
                stationId,
                pieceId: station ? (getOccupationSensorPieceIds(station)[0] ?? '') : '',
              }));
            }}
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="">Starting station</option>
            {stations.map((station) => (
              <option key={station.stationId} value={station.stationId}>
                {station.stationId}
              </option>
            ))}
          </select>
          <select
            value={trainDraft.pieceId}
            onChange={(event) =>
              setTrainDraft((current) => ({ ...current, pieceId: event.target.value }))
            }
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="">Front sensor</option>
            {trainStation
              ? getOccupationSensorPieceIds(trainStation).map((pieceId) => (
                  <option key={pieceId} value={pieceId}>
                    {getSpawnOptionLabel(trainStation, pieceId)}
                  </option>
                ))
              : null}
          </select>
          <select
            value={trainDraft.direction}
            onChange={(event) =>
              setTrainDraft((current) => ({
                ...current,
                direction: event.target.value as MockTrain['direction'],
              }))
            }
            className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100"
          >
            <option value="left-to-right">Left to right</option>
            <option value="right-to-left">Right to left</option>
          </select>
        </div>
        <button
          type="button"
          disabled={isBusy || !trainDraft.stationId || !trainDraft.pieceId}
          onClick={() => void createTrain()}
          className="mt-3 rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-50"
        >
          Create And Spawn Train
        </button>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {Object.values(session?.runtime.trains ?? {}).length === 0 ? (
            <p className="text-sm text-neutral-500">No mock trains in this session.</p>
          ) : (
            Object.values(session?.runtime.trains ?? {}).map((train) => (
              <div
                key={train.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-neutral-100">
                      {train.category} {train.number}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      length {train.length} / {train.direction} / {train.status}
                    </div>
                    <div className="mt-1 font-mono text-xs text-neutral-500">
                      {train.location.stationId}:{train.location.pieceId}
                    </div>
                    {train.movement ? (
                      <div className="mt-1 text-xs text-amber-300">
                        step {train.movement.nextStepIndex + 1}/{train.movement.steps.length}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isBusy || train.status === 'moving'}
                      onClick={() => void moveTrain(train.id)}
                      className="rounded-full bg-amber-400 px-3 py-2 text-xs font-medium text-neutral-950 disabled:opacity-50"
                    >
                      Move To Next Signal
                    </button>
                    <button
                      type="button"
                      disabled={isBusy || train.status === 'moving'}
                      onClick={() => void reverseTrain(train.id)}
                      className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-200 disabled:opacity-50"
                    >
                      Reverse Direction
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void removeTrain(train.id)}
                      className="rounded-full border border-red-900 px-3 py-2 text-xs text-red-300 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Stations In Session
        </h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {stations.length === 0 ? (
            <p className="text-sm text-neutral-500">No stations in this session.</p>
          ) : (
            stations.map((station) => (
              <div
                key={station.stationId}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-sm text-neutral-100">{station.stationId}</div>
                    <div className="text-xs text-neutral-500">
                      {station.layout.width}x{station.layout.height}
                    </div>
                  </div>
                  <Link
                    href={session ? `/runtime/${session._id}/${station.stationId}` : '#'}
                    className="rounded-full bg-amber-400 px-3 py-2 text-xs font-medium text-neutral-950"
                  >
                    Open Runtime
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Outbound Mock Adapter Calls
        </h2>
        <div className="mt-4 space-y-3">
          {outboundCalls.length === 0 ? (
            <p className="text-sm text-neutral-500">No outbound calls yet.</p>
          ) : (
            outboundCalls.map((call, index) => (
              <div
                key={`${call.issuedAt}-${index}`}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3"
              >
                <div className="text-sm font-medium text-neutral-100">{call.type}</div>
                <div className="text-xs text-neutral-500">
                  {call.sessionId} / {call.issuedAt}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
