'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import type { SessionDocument, StationDocument } from '@/lib/station/domain';

type RecoveryAction = 'clear-physical-occupations' | 'clear-routes' | 'reset-session-state';

const actions: Array<{
  id: RecoveryAction;
  title: string;
  description: string;
  confirm: string;
  tone: string;
}> = [
  {
    id: 'clear-physical-occupations',
    title: 'Clear occupation sensors',
    description: 'Forces every Roblox-reported occupation sensor to clear. Use when a detector is stuck occupied.',
    confirm: 'Clear all reported occupation sensors?',
    tone: 'border-amber-700/60 bg-amber-950/30 text-amber-100 hover:bg-amber-900/50',
  },
  {
    id: 'clear-routes',
    title: 'Remove all built routes',
    description: 'Immediately drops route reservations and cancels in-progress route building or cancellation.',
    confirm: 'Remove every active and pending route in this session?',
    tone: 'border-orange-700/60 bg-orange-950/30 text-orange-100 hover:bg-orange-900/50',
  },
  {
    id: 'reset-session-state',
    title: 'Full recovery reset',
    description: 'Clears sensors, routes, delayed actions, simulated trains, lineblock transit, PN state, and switch alignment.',
    confirm: 'Run the full recovery reset? This clears all operational state for this session.',
    tone: 'border-red-700/60 bg-red-950/40 text-red-100 hover:bg-red-900/50',
  },
];

export default function AdminRecoveryClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<SessionDocument | null>(null);
  const [stations, setStations] = useState<StationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [sessionResponse, stationsResponse] = await Promise.all([
      fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, { cache: 'no-store' }),
      fetch(`/api/sessions/${encodeURIComponent(sessionId)}/stations`, { cache: 'no-store' }),
    ]);
    if (!sessionResponse.ok || !stationsResponse.ok) throw new Error('Could not load the session state.');
    const sessionPayload = (await sessionResponse.json()) as { session?: SessionDocument | null };
    const stationsPayload = (await stationsResponse.json()) as { stations?: StationDocument[] };
    setSession(sessionPayload.session ?? null);
    setStations(stationsPayload.stations ?? []);
  }, [sessionId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void refresh()
        .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Could not load session.'))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [refresh]);

  async function run(action: (typeof actions)[number], stationId?: string) {
    const scope = stationId ? `station ${stationId}` : 'the whole session';
    if (!window.confirm(`${action.confirm}\n\nScope: ${scope}.`)) return;
    const runningId = `${action.id}:${stationId ?? 'session'}`;
    setRunning(runningId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/admin-recovery`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: action.id, stationId }),
      });
      const payload = (await response.json()) as { stationsUpdated?: number; error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? 'Recovery action failed.');
      setMessage(`${action.title} completed for ${payload.stationsUpdated ?? 0} station(s).`);
      await refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : 'Recovery action failed.');
    } finally {
      setRunning(null);
    }
  }

  const physicalOccupations = Object.values(session?.runtime.physicalOccupations ?? {}).filter(
    (occupation) => occupation.occupied,
  ).length;
  const activeRoutes = stations.reduce((total, station) => total + Object.keys(station.runtime.activeTrainRoutes).length, 0);
  const pendingActions = stations.reduce((total, station) => total + Object.keys(station.runtime.pendingActions).length, 0);

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-sm uppercase tracking-[0.3em] text-red-300">Administrator recovery console</p>
            <h1 className="text-4xl font-semibold tracking-tight">Session {sessionId}</h1>
            <p className="max-w-3xl text-sm text-neutral-400">Use these controls to recover a live Roblox operation without editing raw state. Changes are saved first, then sent to the Roblox bridge.</p>
          </div>
          <Link href="/" className="rounded-full border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">Back to sessions</Link>
        </header>

        {error ? <div className="rounded-2xl border border-red-800 bg-red-950/50 p-4 text-sm text-red-100">{error}</div> : null}
        {message ? <div className="rounded-2xl border border-emerald-800 bg-emerald-950/40 p-4 text-sm text-emerald-100">{message}</div> : null}

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            ['Stuck sensors', physicalOccupations],
            ['Built routes', activeRoutes],
            ['Delayed actions', pendingActions],
          ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5"><p className="text-sm text-neutral-400">{label}</p><p className="mt-1 text-3xl font-semibold">{value}</p></div>)}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {actions.map((action) => (
            <article key={action.id} className="flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
              <h2 className="text-lg font-semibold">{action.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-neutral-400">{action.description}</p>
              <button type="button" disabled={loading || running !== null} onClick={() => void run(action)} className={`mt-5 rounded-xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-50 ${action.tone}`}>
                {running === `${action.id}:session` ? 'Applying…' : action.title}
              </button>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Stations</h2><p className="text-sm text-neutral-400">Open a station to verify the recovered state.</p></div><button onClick={() => void refresh()} className="rounded-full border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800">Refresh</button></div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {stations.map((station) => (
              <article key={station.stationId} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{station.stationId}</h3><Link href={`/runtime/${encodeURIComponent(sessionId)}/${encodeURIComponent(station.stationId)}`} className="text-sm text-amber-300 hover:text-amber-200">Open runtime</Link></div>
                <p className="mt-1 text-xs text-neutral-500">{Object.keys(station.runtime.activeTrainRoutes).length} routes · {Object.keys(station.runtime.pendingActions).length} delayed actions</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {actions.map((action) => <button key={action.id} type="button" disabled={loading || running !== null} onClick={() => void run(action, station.stationId)} className={`rounded-lg border px-3 py-2 text-xs font-medium transition disabled:cursor-wait disabled:opacity-50 ${action.tone}`}>{running === `${action.id}:${station.stationId}` ? 'Applying…' : action.title}</button>)}
                </div>
              </article>
            ))}
            {!loading && stations.length === 0 ? <p className="text-sm text-neutral-400">No stations found for this session.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
