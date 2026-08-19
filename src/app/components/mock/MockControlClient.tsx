'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ChangeEvent } from 'react';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import type {
  MockTrain,
  SessionDocument,
  SessionLineblockLink,
  StationDocument,
} from '@/lib/station/domain';
import type { StationLayout } from '@/lib/station/layout';

type OutboundCall = {
  type: 'switch:set-position';
  sessionId: string;
  stationId: string;
  pieceId: string;
  controlSlot: string;
  position: string;
  issuedAt: string;
};

type StationSummary = {
  stationId: string;
  lineblockPieceIds: string[];
  premainSignalPieceIds: string[];
};

function getLineblockPieceIds(station: StationDocument): string[] {
  return Object.entries(station.layout.pieces)
    .filter(([, piece]) => piece.type === 'lineblock')
    .map(([pieceId]) => pieceId)
    .sort();
}

function getPremainSignalPieceIds(station: StationDocument): string[] {
  return Object.entries(station.layout.pieces)
    .filter(([, piece]) => piece.type === 'premainSignal' || piece.type === 'premainSignalNoOcp')
    .map(([pieceId]) => pieceId)
    .sort();
}

function getOccupationSensorPieceIds(station: StationDocument): string[] {
  return Object.entries(station.layout.pieces)
    .filter(([, piece]) => Boolean(piece.state.groups.occupation))
    .map(([pieceId]) => pieceId)
    .sort();
}

function makeDefaultInterStationLinkDraft(stations: StationSummary[]) {
  const firstStation = stations[0];
  const secondStation = stations[1] ?? stations[0];

  return {
    aStationId: firstStation?.stationId ?? '',
    aPieceId: firstStation?.lineblockPieceIds[0] ?? '',
    bStationId: secondStation?.stationId ?? '',
    bPieceId: secondStation?.lineblockPieceIds[0] ?? '',
  };
}

export default function MockControlClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdFromUrl = searchParams.get('sessionId')?.trim() ?? '';
  const [session, setSession] = useState<SessionDocument | null>(null);
  const [stations, setStations] = useState<StationDocument[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [outboundCalls, setOutboundCalls] = useState<OutboundCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sessionIdDraft, setSessionIdDraft] = useState('');
  const [stationIdDraft, setStationIdDraft] = useState('station-a');
  const [isBusy, setIsBusy] = useState(false);
  const [interStationLinkDraft, setInterStationLinkDraft] = useState({
    aStationId: '',
    aPieceId: '',
    bStationId: '',
    bPieceId: '',
  });
  const [trainDraft, setTrainDraft] = useState({
    category: 'Os',
    number: '8001',
    length: '1',
    stationId: '',
    pieceId: '',
    direction: 'left-to-right' as MockTrain['direction'],
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stationSummaries = useMemo<StationSummary[]>(
    () =>
      stations.map((station) => ({
        stationId: station.stationId,
        lineblockPieceIds: getLineblockPieceIds(station),
        premainSignalPieceIds: getPremainSignalPieceIds(station),
      })),
    [stations],
  );

  const selectedStation = useMemo(
    () => stations.find((station) => station.stationId === selectedStationId) ?? null,
    [selectedStationId, stations],
  );
  const trainStation = useMemo(
    () => stations.find((station) => station.stationId === trainDraft.stationId) ?? null,
    [stations, trainDraft.stationId],
  );

  function openSession(nextSessionId: string) {
    router.replace(`/mock?sessionId=${encodeURIComponent(nextSessionId)}`);
  }

  function getLineblockOptions(stationId: string) {
    return (
      stationSummaries.find((station) => station.stationId === stationId)?.lineblockPieceIds ?? []
    );
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

    const nextSelectedStationId =
      selectedStationId &&
      stationsPayload.stations.some((station) => station.stationId === selectedStationId)
        ? selectedStationId
        : (stationsPayload.stations[0]?.stationId ?? '');
    setSelectedStationId(nextSelectedStationId);

    const summaries = stationsPayload.stations.map((station) => ({
      stationId: station.stationId,
      lineblockPieceIds: getLineblockPieceIds(station),
      premainSignalPieceIds: getPremainSignalPieceIds(station),
    }));
    const defaultInterStationLinkDraft = makeDefaultInterStationLinkDraft(summaries);
    setInterStationLinkDraft((current) => ({
      aStationId: current.aStationId || defaultInterStationLinkDraft.aStationId,
      aPieceId: current.aPieceId || defaultInterStationLinkDraft.aPieceId,
      bStationId: current.bStationId || defaultInterStationLinkDraft.bStationId,
      bPieceId: current.bPieceId || defaultInterStationLinkDraft.bPieceId,
    }));
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
          setSelectedStationId('');
          setError(null);
          return;
        }

        if (!active) {
          return;
        }

        await refreshSessionEvent(sessionIdFromUrl);
        setError(null);
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
  }, [selectedStationId, session?._id]);

  async function createStation(layout?: StationLayout) {
    if (!session?._id || !stationIdDraft.trim()) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch('/api/stations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: session._id,
          stationId: stationIdDraft.trim(),
          layout,
        }),
      });

      const payload = (await response.json()) as
        { station: StationDocument } | { error?: { message?: string } };

      if (!response.ok || !('station' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Failed to create station.')
            : 'Failed to create station.',
        );
      }

      await refreshSession(session._id);
      setSelectedStationId(payload.station.stationId);
      setError(null);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create station.');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setIsBusy(true);
      const parsedLayout = JSON.parse(await file.text()) as StationLayout;
      await createStation(parsedLayout);
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : 'Failed to import station JSON.',
      );
    } finally {
      event.target.value = '';
      setIsBusy(false);
    }
  }

  async function createInterStationLineblockLink() {
    if (!session?._id) {
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(`/api/sessions/${session._id}/lineblock-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: session._id,
          a: {
            stationId: interStationLinkDraft.aStationId,
            pieceId: interStationLinkDraft.aPieceId,
          },
          b: {
            stationId: interStationLinkDraft.bStationId,
            pieceId: interStationLinkDraft.bPieceId,
          },
        }),
      });

      const payload = (await response.json()) as
        { link: SessionLineblockLink } | { error?: { message?: string } };

      if (!response.ok || !('link' in payload)) {
        throw new Error(
          'error' in payload
            ? (payload.error?.message ?? 'Failed to create lineblock link.')
            : 'Failed to create lineblock link.',
        );
      }

      await refreshSession(session._id);
      setError(null);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'Failed to create lineblock link.');
    } finally {
      setIsBusy(false);
    }
  }

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

  async function handleCreateMockSession() {
    setIsBusy(true);
    try {
      const sessionResponse = await fetch('/api/sessions/mock', {
        method: 'POST',
      });
      const sessionPayload = (await sessionResponse.json()) as {
        session: SessionDocument;
      };
      openSession(sessionPayload.session._id);
      setError(null);
    } catch (createSessionError) {
      setError(
        createSessionError instanceof Error
          ? createSessionError.message
          : 'Failed to create mock session.',
      );
    } finally {
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
          Enter a mock session ID or create a new mock session.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,240px)_auto_auto]">
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
          <button
            type="button"
            disabled={isBusy}
            onClick={() => void handleCreateMockSession()}
            className="rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create Mock Session
          </button>
        </div>
        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <div className="text-sm text-neutral-400">
          {session ? `Mock session ${session._id} active.` : 'Loading mock session...'}
        </div>
        {session ? (
          <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,220px)_auto_auto]">
            <input
              value={stationIdDraft}
              onChange={(event) => setStationIdDraft(event.target.value)}
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100 outline-none transition focus:border-amber-400"
              placeholder="station-b"
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => void createStation()}
              className="rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Demo Station
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-amber-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Import Station JSON
            </button>
          </div>
        ) : null}
        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          onChange={(event) => void handleImportFile(event)}
          className="hidden"
        />
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
                    {trainStation.layout.pieces[pieceId]?.type}:{pieceId}
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
            <p className="text-sm text-neutral-500">No stations yet.</p>
          ) : (
            stations.map((station) => {
              const lineblocks = getLineblockPieceIds(station);
              const premains = getPremainSignalPieceIds(station);
              const isSelected = station.stationId === selectedStationId;

              return (
                <div
                  key={station.stationId}
                  className={`rounded-2xl border p-4 ${
                    isSelected
                      ? 'border-amber-400 bg-neutral-950/90'
                      : 'border-neutral-800 bg-neutral-950/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm text-neutral-100">{station.stationId}</div>
                      <div className="text-xs text-neutral-500">
                        {lineblocks.length} lineblock{lineblocks.length === 1 ? '' : 's'} /{' '}
                        {premains.length} premain
                        {premains.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedStationId(station.stationId)}
                        className="rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-200"
                      >
                        Inspect
                      </button>
                      <Link
                        href={session ? `/runtime/${session._id}/${station.stationId}` : '#'}
                        className="rounded-full bg-amber-400 px-3 py-2 text-xs font-medium text-neutral-950"
                      >
                        Open Runtime
                      </Link>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {lineblocks.length === 0 ? (
                      <span className="text-xs text-neutral-500">
                        No lineblocks in this station.
                      </span>
                    ) : (
                      lineblocks.map((pieceId) => (
                        <span
                          key={pieceId}
                          className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300"
                        >
                          {pieceId}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {premains.length === 0 ? (
                      <span className="text-xs text-neutral-500">
                        No premain signals in this station.
                      </span>
                    ) : (
                      premains.map((pieceId) => (
                        <span
                          key={pieceId}
                          className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300"
                        >
                          premain:{pieceId}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Lineblock Links Between Stations
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <select
              value={interStationLinkDraft.aStationId}
              onChange={(event) =>
                setInterStationLinkDraft((current) => ({
                  ...current,
                  aStationId: event.target.value,
                  aPieceId: getLineblockOptions(event.target.value)[0] ?? '',
                }))
              }
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
            >
              <option value="">Station A</option>
              {stationSummaries.map((station) => (
                <option key={station.stationId} value={station.stationId}>
                  {station.stationId}
                </option>
              ))}
            </select>
            <select
              value={interStationLinkDraft.aPieceId}
              onChange={(event) =>
                setInterStationLinkDraft((current) => ({
                  ...current,
                  aPieceId: event.target.value,
                }))
              }
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
            >
              <option value="">Lineblock A</option>
              {getLineblockOptions(interStationLinkDraft.aStationId).map((pieceId) => (
                <option key={pieceId} value={pieceId}>
                  {pieceId}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <select
              value={interStationLinkDraft.bStationId}
              onChange={(event) =>
                setInterStationLinkDraft((current) => ({
                  ...current,
                  bStationId: event.target.value,
                  bPieceId: getLineblockOptions(event.target.value)[0] ?? '',
                }))
              }
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
            >
              <option value="">Station B</option>
              {stationSummaries.map((station) => (
                <option key={station.stationId} value={station.stationId}>
                  {station.stationId}
                </option>
              ))}
            </select>
            <select
              value={interStationLinkDraft.bPieceId}
              onChange={(event) =>
                setInterStationLinkDraft((current) => ({
                  ...current,
                  bPieceId: event.target.value,
                }))
              }
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
            >
              <option value="">Lineblock B</option>
              {getLineblockOptions(interStationLinkDraft.bStationId).map((pieceId) => (
                <option key={pieceId} value={pieceId}>
                  {pieceId}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          disabled={
            isBusy ||
            !interStationLinkDraft.aStationId ||
            !interStationLinkDraft.aPieceId ||
            !interStationLinkDraft.bStationId ||
            !interStationLinkDraft.bPieceId
          }
          onClick={() => void createInterStationLineblockLink()}
          className="mt-4 rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create Inter-Station Lineblock Link
        </button>
        <div className="mt-4 space-y-3">
          {Object.values(session?.topology.lineblockLinks ?? {}).length === 0 ? (
            <p className="text-sm text-neutral-500">No inter-station lineblock links configured.</p>
          ) : (
            Object.values(session?.topology.lineblockLinks ?? {}).map((link) => (
              <div
                key={link.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3"
              >
                <div className="text-sm font-medium text-neutral-100">
                  {link.a.stationId}:{link.a.pieceId} {'<->'} {link.b.stationId}:{link.b.pieceId}
                </div>
                <div className="text-xs text-neutral-500">{link.createdAt}</div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">
          Selected Station Summary
        </h2>
        <div className="mt-4">
          {selectedStation ? (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
              <div className="font-mono text-sm text-neutral-100">{selectedStation.stationId}</div>
              <div className="mt-2 text-xs text-neutral-500">
                {selectedStation.layout.width}x{selectedStation.layout.height}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {getLineblockPieceIds(selectedStation).map((pieceId) => (
                  <span
                    key={pieceId}
                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300"
                  >
                    {pieceId}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {getPremainSignalPieceIds(selectedStation).map((pieceId) => (
                  <span
                    key={pieceId}
                    className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300"
                  >
                    premain:{pieceId}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Select a station to inspect it.</p>
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
                  {call.stationId} / {call.pieceId}:{call.controlSlot} / {call.position} /{' '}
                  {call.issuedAt}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
