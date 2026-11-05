'use client';

import type { LiveRobloxSessionSummary } from '@/lib/station/domain';
import { useCallback, useEffect, useState } from 'react';

export function SessionControlView({
  onLaunchRuntime,
  placeId,
}: {
  onLaunchRuntime?: (sessionId: string, stationId: string) => void;
  placeId: string;
}) {
  const [liveSessions, setLiveSessions] = useState<LiveRobloxSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLive = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/sessions/live', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLiveSessions(
        (data.sessions || []).filter(
          (session: LiveRobloxSessionSummary) => session.placeId === placeId,
        ),
      );
    } catch (err: unknown) {
      setError((err instanceof Error ? err.message : '') || 'Nepodarilo sa načítať session');
    } finally {
      setLoading(false);
    }
  }, [placeId]);

  useEffect(() => {
    const initial = setTimeout(fetchLive, 0);
    const interval = setInterval(fetchLive, 20000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [fetchLive]);

  return (
    <div className="flex-1 flex flex-col bg-white overflow-hidden text-[12px] font-sans">
      {/* Top Ribbon */}
      <div className="h-8 bg-[var(--aero-ribbon-bg)] border-b border-[var(--aero-ribbon-border)] px-3 flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-[var(--aero-text)]">
            Správa Prevádzkových Session (JOP & Roblox Bridge)
          </span>
          <span className="text-[var(--aero-text-muted)]">|</span>
          <span className="text-[11px] text-[var(--aero-text-muted)]">
            Aktívne simulácie a prepojenia staníc riadené priamo z DIS rozhrania.
          </span>
        </div>

        <button
          onClick={fetchLive}
          className="aero-btn text-[11px] font-semibold text-blue-700 flex items-center space-x-1"
        >
          <svg
            viewBox="0 0 24 24"
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M23 4v6h-6" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span>Obnoviť session</span>
        </button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {/* Live Roblox Sessions Box */}
        <div className="border border-[var(--aero-panel-border)] rounded-[3px] bg-white shadow-xs overflow-hidden">
          <div className="h-7 bg-gradient-to-b from-[#f7f9fc] to-[#e2e8f0] border-b border-[#cbd5e1] px-3 flex items-center justify-between font-semibold text-xs text-[var(--aero-text)]">
            <span>Živé Roblox Sessiony (Heartbeat)</span>
            <span className="text-[11px] font-normal text-[var(--aero-text-muted)]">
              Automaticky detegované cez WebSocket / MessagingService
            </span>
          </div>

          <div className="p-3">
            {loading && liveSessions.length === 0 ? (
              <div className="text-slate-500 py-3 text-center">Načítavam aktívne sessiony...</div>
            ) : error ? (
              <div className="text-red-600 p-2 bg-red-50 rounded border border-red-200">
                {error}
              </div>
            ) : liveSessions.length === 0 ? (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded text-center text-slate-500 text-xs">
                Momentálne nie je aktívny žiadny Roblox server. Môžete spustiť lokálnu / mock
                session nižšie.
              </div>
            ) : (
              <div className="space-y-2">
                {liveSessions.map((s) => (
                  <div
                    key={s.sessionId}
                    className="p-3 border border-slate-200 rounded bg-slate-50/50 flex flex-wrap items-center justify-between gap-2 hover:border-blue-300"
                  >
                    <div>
                      <div className="font-bold text-slate-800 text-xs flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>Session ID: {s.sessionId}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Posledný signál: {new Date(s.lastHeartbeatAt).toLocaleTimeString()} •
                        Stanice v sieti: {s.stations?.length || 0}
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {s.stations &&
                        s.stations.map((st) => (
                          <button
                            key={st.stationId}
                            onClick={() => {
                              if (onLaunchRuntime) onLaunchRuntime(s.sessionId, st.stationId);
                            }}
                            className="aero-btn font-semibold text-emerald-800 bg-emerald-50 border-emerald-600 hover:bg-emerald-100 flex items-center space-x-1"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="w-3 h-3"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
                            </svg>
                            <span>Otvoriť stanicu: {st.stationId}</span>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Manual Session & JOP Tools Box */}
        <div className="border border-[var(--aero-panel-border)] rounded-[3px] bg-white shadow-xs overflow-hidden">
          <div className="h-7 bg-gradient-to-b from-[#f7f9fc] to-[#e2e8f0] border-b border-[#cbd5e1] px-3 flex items-center font-semibold text-xs text-[var(--aero-text)]">
            Priame spustenie JOP nástrojov & Editora
          </div>

          <div className="p-4 space-y-3">
            <p>Reláciu a stanicu vyberte v hornej lište.</p>

            <div className="pt-2 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (onLaunchRuntime) onLaunchRuntime('editor', '');
                }}
                className="aero-btn text-slate-800 flex items-center space-x-1"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>Editor staníc</span>
              </button>

              <button
                onClick={() => {
                  if (onLaunchRuntime) onLaunchRuntime('linker', '');
                }}
                className="aero-btn text-slate-800 flex items-center space-x-1"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
                <span>Prepojovač tratí (Linker)</span>
              </button>

              <button
                onClick={() => {
                  if (onLaunchRuntime) onLaunchRuntime('map', '');
                }}
                className="aero-btn text-slate-800 flex items-center space-x-1"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
                <span>Mapa topológie</span>
              </button>

              <button
                onClick={() => {
                  if (onLaunchRuntime) onLaunchRuntime('mock', '');
                }}
                className="aero-btn text-slate-800 flex items-center space-x-1"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
                  <rect x="9" y="11" width="14" height="10" rx="2" />
                  <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="3" />
                </svg>
                <span>Simulátor vlakov (Mock)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
