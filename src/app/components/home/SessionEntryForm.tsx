'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

function encodeSegment(value: string) {
  return encodeURIComponent(value.trim());
}

export default function SessionEntryForm() {
  const [sessionId, setSessionId] = useState('');
  const [stationId, setStationId] = useState('');

  const runtimeHref = useMemo(() => {
    if (!sessionId.trim() || !stationId.trim()) {
      return null;
    }

    return `/runtime/${encodeSegment(sessionId)}/${encodeSegment(stationId)}`;
  }, [sessionId, stationId]);

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="space-y-3">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-400">Railway Control Panel</p>
          <h1 className="text-4xl font-semibold tracking-tight">Open a runtime station session</h1>
          <p className="max-w-2xl text-sm text-neutral-400">
            Runtime control reads canonical station state from the backend. Use editor mode for layout
            authoring, map mode for station/session topology, and mock mode to simulate the Roblox side.
          </p>
        </header>

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
