'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { disFetch } from './api-client';
import type { SessionClockSnapshot } from './clock';
export function useSessionClock(sessionId: string) {
  const requestSequence = useRef(0);
  const [sample, setSample] = useState<{ clock: SessionClockSnapshot; deltaMs: number }>();
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const fetchClock = useCallback(async () => {
    if (!sessionId) return;
    const sequence = ++requestSequence.current;
    const sentAt = Date.now();
    const result = await disFetch<{ clock: SessionClockSnapshot }>(
      '/api/dis/session-clock?' + new URLSearchParams({ sessionId }),
      { signal: AbortSignal.timeout(10000) },
    );
    return {
      clock: result.clock,
      sequence,
      deltaMs: result.clock.serverUnixMs - (sentAt + Date.now()) / 2,
    };
  }, [sessionId]);
  useEffect(() => {
    let active = true;
    const update = async () => {
      try {
        const next = await fetchClock();
        if (active && (!next || next.sequence === requestSequence.current)) {
          setSample(next);
          setError('');
        }
      } catch (reason) {
        if (active)
          setError(reason instanceof Error ? reason.message : 'Čas relácie sa nepodarilo overiť.');
      }
    };
    void update();
    const timer = setInterval(update, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [fetchClock]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = sample?.clock.sessionId === sessionId ? sample : undefined;
  const refresh = async () => {
    const next = await fetchClock();
    if (next && next.sequence !== requestSequence.current) return;
    setSample(next);
    setError('');
  };
  return {
    clock: current?.clock,
    now: now + (current?.deltaMs || 0),
    error,
    serverDeltaMs: current?.deltaMs || 0,
    refresh,
  };
}
