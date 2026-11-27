'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { reconnectDelay } from '../reconnect';
import { disFetch } from './api-client';

export function useDisResource<T>(url: string | null, initial: T, intervalMs = 15000) {
  const [value, setValue] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const generation = useRef(0);
  const failures = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef(true);
  const refresh = useCallback(
    async function refreshResource() {
      if (!url) return;
      clearTimeout(retry.current);
      const request = ++generation.current;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          disFetch<T>(url),
          new Promise<never>((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error('Načítanie trvalo príliš dlho. Skúste to znova.')),
              12000,
            );
          }),
        ]);
        if (active.current && request === generation.current) {
          failures.current = 0;
          setValue(result);
          setError(null);
        }
      } catch (error) {
        if (active.current && request === generation.current) {
          retry.current = setTimeout(
            () => void refreshResource(),
            reconnectDelay(failures.current++),
          );
          setError(error instanceof Error ? error.message : 'Údaje sa nepodarilo načítať.');
        }
      } finally {
        clearTimeout(timeout);
        if (active.current && request === generation.current) setLoading(false);
      }
    },
    [url],
  );
  useEffect(() => {
    active.current = true;
    generation.current++;
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(() => {
      if (!failures.current) void refresh();
    }, intervalMs);
    const online = () => void refresh();
    window.addEventListener('online', online);
    return () => {
      active.current = false;
      clearTimeout(initial);
      clearTimeout(retry.current);
      failures.current = 0;
      window.removeEventListener('online', online);
      clearInterval(interval);
    };
  }, [refresh, intervalMs]);
  return { value, loading, error, refresh };
}
