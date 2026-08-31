'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { LiveRobloxSessionSummary } from '@/lib/station/domain';

function encodeSegment(value: string) {
  return encodeURIComponent(value.trim());
}

function formatHeartbeat(timestamp: string) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(date);
}

export default function SessionEntryForm() {
  const [sessionId, setSessionId] = useState('');
  const [stationId, setStationId] = useState('');
  const [liveSessions, setLiveSessions] = useState<LiveRobloxSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runtimeHref =
    sessionId.trim() && stationId.trim()
      ? `/runtime/${encodeSegment(sessionId)}/${encodeSegment(stationId)}`
      : null;

  useEffect(() => {
    let cancelled = false;

    async function loadLiveSessions() {
      try {
        const response = await fetch('/api/sessions/live', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as { sessions?: LiveRobloxSessionSummary[] };
        if (!cancelled) {
          setLiveSessions(payload.sessions ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load live sessions.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadLiveSessions();
    const intervalId = window.setInterval(() => {
      void loadLiveSessions();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Railway Control Panel</p>
          <h1 className="text-4xl font-semibold tracking-tight">Open a runtime station session</h1>
          <p className="max-w-3xl text-sm text-neutral-400">
            Roblox sessions now publish liveness to the backend. Pick a live session and station below,
            or fall back to manual entry when you need a direct runtime URL.
          </p>
        </header>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-neutral-100">Live Roblox Sessions</h2>
              <p className="text-sm text-neutral-400">
                Sessions disappear automatically when the bridge misses heartbeats for more than one
                minute.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setError(null);
                void fetch('/api/sessions/live', { cache: 'no-store' })
                  .then(async (response) => {
                    if (!response.ok) {
                      throw new Error(`Request failed with status ${response.status}.`);
                    }
                    return (await response.json()) as { sessions?: LiveRobloxSessionSummary[] };
                  })
                  .then((payload) => {
                    setLiveSessions(payload.sessions ?? []);
                  })
                  .catch((refreshError) => {
                    setError(
                      refreshError instanceof Error
                        ? refreshError.message
                        : 'Failed to load live sessions.',
                    );
                  })
                  .finally(() => {
                    setLoading(false);
                  });
              }}
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800"
            >
              Refresh
            </button>
          </div>

          <div className="mt-6 space-y-4">
            {loading ? (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4 text-sm text-neutral-400">
                Loading live sessions...
              </div>
            ) : null}

            {!loading && error ? (
              <div className="rounded-2xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            {!loading && !error && liveSessions.length === 0 ? (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4 text-sm text-neutral-400">
                No live Roblox sessions are currently reporting heartbeats.
              </div>
            ) : null}

            {!loading && !error
              ? liveSessions.map((session) => (
                  <article
                    key={session.sessionId}
                    className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-lg font-semibold text-neutral-100">{session.sessionId}</h3>
                          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-300">
                            Live
                          </span>
                        </div>
                        <p className="text-sm text-neutral-400">
                          PlaceId {session.placeId} • Server {session.serverId}
                        </p>
                        <p className="text-xs text-neutral-500">
                          Last heartbeat {formatHeartbeat(session.lastHeartbeatAt)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <Link
                        href={`/admin/${encodeSegment(session.sessionId)}`}
                        className="rounded-full border border-red-700/70 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-950/50"
                      >
                        Admin Console
                      </Link>
                      {session.stations.map((station) => (
                        <Link
                          key={station.stationId}
                          href={`/runtime/${encodeSegment(session.sessionId)}/${encodeSegment(station.stationId)}`}
                          className="rounded-full bg-amber-400 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-amber-300"
                        >
                          {station.stationId}
                        </Link>
                      ))}
                    </div>
                  </article>
                ))
              : null}
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl border border-neutral-800 bg-neutral-900/80 p-6 md:grid-cols-2">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-neutral-300">Session ID</span>
            <input
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
              placeholder="mock-session-001"
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 outline-none transition focus:border-amber-400"
            />
          </label>

          <label className="flex flex-col gap-2 text-sm">
            <span className="text-neutral-300">Station ID</span>
            <input
              value={stationId}
              onChange={(event) => setStationId(event.target.value)}
              placeholder="station-a"
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 outline-none transition focus:border-amber-400"
            />
          </label>

          <div className="flex flex-wrap gap-3 md:col-span-2">
            <Link
              href={runtimeHref ?? '#'}
              aria-disabled={!runtimeHref}
              className={`rounded-full px-5 py-3 text-sm font-medium transition ${
                runtimeHref
                  ? 'bg-amber-400 text-neutral-950 hover:bg-amber-300'
                  : 'cursor-not-allowed bg-neutral-800 text-neutral-500'
              }`}
            >
              Open Runtime
            </Link>
            <Link
              href="/editor"
              className="rounded-full border border-neutral-700 px-5 py-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800"
            >
              Open Editor
            </Link>
            <Link
              href="/map"
              className="rounded-full border border-neutral-700 px-5 py-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800"
            >
              Open Map
            </Link>
            <Link
              href="/mock"
              className="rounded-full border border-neutral-700 px-5 py-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800"
            >
              Open Mock Mode
            </Link>
            <Link
              href="/test/bounds"
              className="rounded-full border border-neutral-700 px-5 py-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800"
            >
              Tile Inspector
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
