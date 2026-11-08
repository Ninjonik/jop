'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { defaultLocale, isLocale, localeTags, translate, type Locale } from './translate';

const storageKey = 'dis-language';
let currentLocale: Locale = defaultLocale;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => currentLocale;
const serverSnapshot = () => defaultLocale;

function applyLocale(locale: Locale) {
  currentLocale = locale;
  document.documentElement.lang = locale;
  listeners.forEach((listener) => listener());
}

export function setLocale(locale: Locale) {
  applyLocale(locale);
  try {
    localStorage.setItem(storageKey, locale);
  } catch {
    /* Language switching also works without storage. */
  }
}

/** Subscribe each UI surface without remounting it or losing unsaved editor/chat state. */
export function useLocale() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

export function useLocaleTag() {
  return localeTags[useLocale()];
}

export function useTranslation() {
  const locale = useLocale();
  // Bind to React's snapshot, including the Slovak hydration snapshot for delayed boundaries.
  return useCallback(
    (text: string | null | undefined, ...values: (string | number | null | undefined)[]) =>
      translate(text ?? '', locale, ...values.map((value) => value ?? '')),
    [locale],
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const pathname = usePathname();
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (isLocale(saved)) applyLocale(saved);
    } catch {
      /* Keep Slovak when browser storage is unavailable. */
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey)
        applyLocale(isLocale(event.newValue) ? event.newValue : defaultLocale);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = translate(document.title, locale);
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = translate(description.content, locale);
  }, [locale, pathname]);
  return children;
}

export function LanguageSelector() {
  const locale = useLocale();
  return (
    <label className="inline-flex items-center gap-1 text-xs">
      <span>{locale === 'sk' ? 'Jazyk' : 'Language'}</span>
      <select
        className="aero-select"
        aria-label={locale === 'sk' ? 'Jazyk aplikácie' : 'Application language'}
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) setLocale(event.target.value);
        }}
      >
        <option value="sk" lang="sk">
          Slovenčina
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
    </label>
  );
}

// Server-rendered page chrome can use this boundary without making layout data client-owned.
export function LocalizedText({ text }: { text: string }) {
  const t = useTranslation();
  return t(text);
}
