'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

import type {
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
  position: string;
  issuedAt: string;
};

type StationSummary = {
  stationId: string;
  pieceIds: string[];
};

function getLineblockPieceIds(station: StationDocument): string[] {
  return Object.entries(station.layout.pieces)
    .filter(([, piece]) => piece.type === 'lineblock')
    .map(([pieceId]) => pieceId)
    .sort();
}

function makeDefaultLinkDraft(stations: StationSummary[]) {
  const firstStation = stations[0];
  const secondStation = stations[1] ?? stations[0];

  return {
    aStationId: firstStation?.stationId ?? '',
    aPieceId: firstStation?.pieceIds[0] ?? '',
    bStationId: secondStation?.stationId ?? '',
    bPieceId: secondStation?.pieceIds[0] ?? '',
  };
}

export default function MockControlClient() {
  const [session, setSession] = useState<SessionDocument | null>(null);
  const [stations, setStations] = useState<StationDocument[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [outboundCalls, setOutboundCalls] = useState<OutboundCall[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stationIdDraft, setStationIdDraft] = useState('station-a');
  const [isBusy, setIsBusy] = useState(false);
  const [linkDraft, setLinkDraft] = useState({
    aStationId: '',
    aPieceId: '',
    bStationId: '',
    bPieceId: '',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stationSummaries = useMemo<StationSummary[]>(
    () =>
      stations.map((station) => ({
        stationId: station.stationId,
        pieceIds: getLineblockPieceIds(station),
      })),
    [stations]
  );

  const selectedStation = useMemo(
    () => stations.find((station) => station.stationId === selectedStationId) ?? null,
    [selectedStationId, stations]
  );

  async function refreshSession(nextSessionId: string) {
    const [sessionResponse, stationsResponse, outboundResponse] = await Promise.all([
      fetch(`/api/sessions/${nextSessionId}`, { cache: 'no-store' }),
      fetch(`/api/sessions/${nextSessionId}/stations`, { cache: 'no-store' }),
      fetch(`/api/mock-roblox/outbound-calls?sessionId=${nextSessionId}`, { cache: 'no-store' }),
    ]);

    const sessionPayload = (await sessionResponse.json()) as
      | { session: SessionDocument }
      | { error?: { message?: string } };
    const stationsPayload = (await stationsResponse.json()) as
      | { stations: StationDocument[] }
      | { error?: { message?: string } };
    const outboundPayload = (await outboundResponse.json()) as { calls: OutboundCall[] };

    if (!sessionResponse.ok || !('session' in sessionPayload)) {
      throw new Error(
        'error' in sessionPayload ? sessionPayload.error?.message ?? 'Failed to load session.' : 'Failed to load session.'
      );
    }

    if (!stationsResponse.ok || !('stations' in stationsPayload)) {
      throw new Error(
        'error' in stationsPayload
          ? stationsPayload.error?.message ?? 'Failed to load session stations.'
          : 'Failed to load session stations.'
      );
    }

    setSession(sessionPayload.session);
    setStations(stationsPayload.stations);
    setOutboundCalls(outboundPayload.calls);

    const nextSelectedStationId =
      selectedStationId && stationsPayload.stations.some((station) => station.stationId === selectedStationId)
        ? selectedStationId
        : stationsPayload.stations[0]?.stationId ?? '';
    setSelectedStationId(nextSelectedStationId);

    const summaries = stationsPayload.stations.map((station) => ({
      stationId: station.stationId,
      pieceIds: getLineblockPieceIds(station),
    }));
    const defaultDraft = makeDefaultLinkDraft(summaries);
    setLinkDraft((current) => ({
      aStationId: current.aStationId || defaultDraft.aStationId,
      aPieceId: current.aPieceId || defaultDraft.aPieceId,
      bStationId: current.bStationId || defaultDraft.bStationId,
      bPieceId: current.bPieceId || defaultDraft.bPieceId,
    }));
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const sessionResponse = await fetch('/api/sessions/mock', {
          method: 'POST',
        });
        const sessionPayload = (await sessionResponse.json()) as {
          session: SessionDocument;
        };

        if (!active) {
          return;
        }

        await refreshSession(sessionPayload.session._id);
        setError(null);
      } catch (bootstrapError) {
        if (!active) {
          return;
        }

        setError(
          bootstrapError instanceof Error ? bootstrapError.message : 'Failed to start mock session.'
        );
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!session?._id) {
      return;
    }

    const interval = setInterval(() => {
      void refreshSession(session._id).catch(() => undefined);
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
        | { station: StationDocument }
        | { error?: { message?: string } };

      if (!response.ok || !('station' in payload)) {
        throw new Error(
          'error' in payload ? payload.error?.message ?? 'Failed to create station.' : 'Failed to create station.'
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
      setError(importError instanceof Error ? importError.message : 'Failed to import station JSON.');
    } finally {
      event.target.value = '';
      setIsBusy(false);
    }
  }

  async function createLineblockLink() {
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
            stationId: linkDraft.aStationId,
            pieceId: linkDraft.aPieceId,
          },
          b: {
            stationId: linkDraft.bStationId,
            pieceId: linkDraft.bPieceId,
          },
        }),
      });

      const payload = (await response.json()) as
        | { link: SessionLineblockLink }
        | { error?: { message?: string } };

      if (!response.ok || !('link' in payload)) {
        throw new Error(
          'error' in payload
            ? payload.error?.message ?? 'Failed to create lineblock link.'
            : 'Failed to create lineblock link.'
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

  function getPieceOptions(stationId: string) {
    return stationSummaries.find((station) => station.stationId === stationId)?.pieceIds ?? [];
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-4">
        <div className="text-sm text-neutral-400">
          {session ? `Mock session ${session._id} active.` : 'Creating mock session...'}
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
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-neutral-400">Stations In Session</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {stations.length === 0 ? (
            <p className="text-sm text-neutral-500">No stations yet.</p>
          ) : (
            stations.map((station) => {
              const lineblocks = getLineblockPieceIds(station);
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
                        {lineblocks.length} lineblock{lineblocks.length === 1 ? '' : 's'}
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
                      <span className="text-xs text-neutral-500">No lineblocks in this station.</span>
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
              value={linkDraft.aStationId}
              onChange={(event) =>
                setLinkDraft((current) => ({
                  ...current,
                  aStationId: event.target.value,
                  aPieceId: getPieceOptions(event.target.value)[0] ?? '',
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
              value={linkDraft.aPieceId}
              onChange={(event) =>
                setLinkDraft((current) => ({
                  ...current,
                  aPieceId: event.target.value,
                }))
              }
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
            >
              <option value="">Lineblock A</option>
              {getPieceOptions(linkDraft.aStationId).map((pieceId) => (
                <option key={pieceId} value={pieceId}>
                  {pieceId}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <select
              value={linkDraft.bStationId}
              onChange={(event) =>
                setLinkDraft((current) => ({
                  ...current,
                  bStationId: event.target.value,
                  bPieceId: getPieceOptions(event.target.value)[0] ?? '',
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
              value={linkDraft.bPieceId}
              onChange={(event) =>
                setLinkDraft((current) => ({
                  ...current,
                  bPieceId: event.target.value,
                }))
              }
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-neutral-100"
            >
              <option value="">Lineblock B</option>
              {getPieceOptions(linkDraft.bStationId).map((pieceId) => (
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
            !linkDraft.aStationId ||
            !linkDraft.aPieceId ||
            !linkDraft.bStationId ||
            !linkDraft.bPieceId
          }
          onClick={() => void createLineblockLink()}
          className="mt-4 rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Create Lineblock Link
        </button>
        <div className="mt-4 space-y-3">
          {Object.values(session?.topology.lineblockLinks ?? {}).length === 0 ? (
            <p className="text-sm text-neutral-500">No inter-station lineblock links configured.</p>
          ) : (
            Object.values(session?.topology.lineblockLinks ?? {}).map((link) => (
              <div key={link.id} className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3">
                <div className="text-sm font-medium text-neutral-100">
                  {link.a.stationId}:{link.a.pieceId} ↔ {link.b.stationId}:{link.b.pieceId}
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
                Revision {selectedStation.revision} · {selectedStation.layout.width}×{selectedStation.layout.height}
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
              <div key={`${call.issuedAt}-${index}`} className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3">
                <div className="text-sm font-medium text-neutral-100">{call.type}</div>
                <div className="text-xs text-neutral-500">
                  {call.stationId} · {call.pieceId} · {call.position} · {call.issuedAt}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
