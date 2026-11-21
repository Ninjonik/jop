'use client';

import { useSyncExternalStore } from 'react';

export const defaultBrowserSettings = {
  trainTooltips: false,
  radioSimulation: true,
  microphone: '',
  speaker: '',
  volume: 1,
  incomingMessageSounds: true,
  outgoingMessageSounds: true,
  messageVolume: 0.7,
  echoCancellation: true,
  noiseSuppression: true,
};
export type BrowserSettings = typeof defaultBrowserSettings;
const key = 'dis-browser-settings';
let cached = defaultBrowserSettings;
let serialized: string | null = null;
const listeners = new Set<() => void>();
function snapshot() {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== serialized) {
      serialized = raw;
      const saved = JSON.parse(raw || '{}');
      cached = { ...defaultBrowserSettings };
      for (const name of Object.keys(cached) as (keyof BrowserSettings)[]) {
        if (typeof saved[name] === typeof cached[name])
          Object.assign(cached, { [name]: saved[name] });
      }
      cached.volume = Math.max(0, Math.min(2, cached.volume));
  cached.messageVolume = Math.max(0, Math.min(1, cached.messageVolume));
    }
  } catch {
    /* Use defaults when storage is unavailable. */
  }
  return cached;
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}
export function getBrowserSettings() {
  return snapshot();
}
export function setBrowserSettings(patch: Partial<BrowserSettings>) {
  cached = { ...snapshot(), ...patch };
  serialized = JSON.stringify(cached);
  try {
    localStorage.setItem(key, serialized);
  } catch {
    /* Keep this tab usable. */
  }
  listeners.forEach((listener) => listener());
  window.dispatchEvent(new Event('dis-audio-settings'));
  if ('microphone' in patch || 'echoCancellation' in patch || 'noiseSuppression' in patch)
    window.dispatchEvent(new Event('dis-input-settings'));
}
export function useBrowserSettings() {
  return useSyncExternalStore(subscribe, snapshot, () => defaultBrowserSettings);
}
export function audioCaptureSettings() {
  const settings = snapshot();
  return {
    deviceId: settings.microphone || undefined,
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
  };
}
