'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { disFetch } from './api-client';
import { useDisAuth } from '@/lib/dis/auth-context';
export function useUserPreference<T extends Record<string, string | number | boolean | string[]>>(
  key: string,
  defaults: T,
) {
  const { profile } = useDisAuth();
  const owner = profile?.userId || '';
  const storageKey = `dis-pref:${owner}:${key}`;
  const [value, setValue] = useState<T>(defaults);
  const [error, setError] = useState('');
  const dirty = useRef(false),
    serial = useRef(Promise.resolve());
  const normalize = (input: unknown): T => {
    const result = { ...defaults };
    if (input && typeof input === 'object')
      for (const key of Object.keys(defaults)) {
        const entry = (input as Record<string, unknown>)[key];
        if (
          Array.isArray(defaults[key])
            ? Array.isArray(entry) && entry.every((x) => typeof x === 'string')
            : typeof entry === typeof defaults[key]
        )
          Object.assign(result, { [key]: entry });
      }
    return result;
  };
  useEffect(() => {
    let live = true;
    dirty.current = false;
    Promise.resolve().then(() => {
      if (live) {
        try {
          setValue(normalize(JSON.parse(localStorage.getItem(storageKey) || 'null')));
        } catch {
          setValue(defaults);
        }
      }
    });
    if (!owner) return;
    disFetch<{ value: T | null }>(`/api/dis/preferences?key=${encodeURIComponent(key)}`)
      .then((result) => {
        if (live && !dirty.current && result.value) setValue(normalize(result.value));
      })
      .catch(() => {
        if (live) setError('Nastavenia sú zatiaľ uložené iba v tomto prehliadači.');
      });
    return () => {
      live = false;
    };
    // Defaults describe this preference, not reactive application data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, owner, storageKey]);
  const update = useCallback(
    (patch: Partial<T>) => {
      dirty.current = true;
      setValue((previous) => {
        const next = { ...previous, ...patch };
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    [storageKey],
  );
  useEffect(() => {
    if (!dirty.current || !owner) return;
    const timer = setTimeout(() => {
      const payload = { ...value };
      serial.current = serial.current
        .catch(() => {})
        .then(async () => {
          await disFetch('/api/dis/preferences', {
            method: 'POST',
            body: JSON.stringify({ key, value: payload }),
          });
          setError('');
        })
        .catch(() => setError('Nastavenia sú zatiaľ uložené iba v tomto prehliadači.'));
    }, 500);
    return () => clearTimeout(timer);
  }, [value, key, owner]);
  return [value, update, error] as const;
}
export function preferenceHash(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
