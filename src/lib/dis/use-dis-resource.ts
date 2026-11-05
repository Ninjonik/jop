'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { disFetch } from './api-client';

export function useDisResource<T>(url: string | null, initial: T, intervalMs = 15000) {
  const [value, setValue] = useState<T>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const generation = useRef(0);
  const active = useRef(true);
  const refresh = useCallback(async () => {
    if (!url) return;
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
        setValue(result);
        setError(null);
      }
    } catch (error) {
      if (active.current && request === generation.current)
        setError(error instanceof Error ? error.message : 'Údaje sa nepodarilo načítať.');
    } finally {
      clearTimeout(timeout);
      if (active.current && request === generation.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    active.current = true;
    generation.current++;
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, intervalMs);
    return () => {
      active.current = false;
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [refresh, intervalMs]);
  return { value, loading, error, refresh };
}
