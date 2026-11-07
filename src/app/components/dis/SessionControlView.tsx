'use client';
import { AeroIcon } from '@/app/components/ui/AeroIcon';

import type { LiveRobloxSessionSummary } from '@/lib/station/domain';
import { useCallback, useEffect, useState } from 'react';

export function SessionControlView({
  onLaunchRuntime,
  placeId,
  canLaunchSimulator = false,
}: {
  onLaunchRuntime?: (sessionId: string, stationId: string) => void;
  placeId: string;
  canLaunchSimulator?: boolean;
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
          <AeroIcon name="refresh" />
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
                            <AeroIcon name="play" />
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

        {canLaunchSimulator && (
          <div className="flex flex-wrap items-center gap-3 border-t border-[var(--aero-panel-border)] bg-[var(--grid-row-alt)] p-3">
            <button
              className="aero-btn"
              disabled={!onLaunchRuntime}
              onClick={() => onLaunchRuntime?.('mock', '')}
            >
              <AeroIcon name="play" />
              Otvoriť simulátor vlakov
            </button>
            <span className="text-[var(--aero-text-muted)]">
              Vyskúšajte pohyb vlakov vo vybranej relácii.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
