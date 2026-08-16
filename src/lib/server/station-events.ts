import type { StationDocument } from '@/lib/station/domain';

type StationListener = (station: StationDocument) => void;

const listenersByKey = new Map<string, Set<StationListener>>();

function toStationKey(sessionId: string, stationId: string) {
  return `${sessionId}:${stationId}`;
}

export function publishStationSnapshot(station: StationDocument) {
  const key = toStationKey(station.sessionId, station.stationId);
  const listeners = listenersByKey.get(key);
  if (!listeners) {
    return;
  }

  listeners.forEach((listener) => listener(station));
}

export function subscribeToStation(
  sessionId: string,
  stationId: string,
  listener: StationListener
) {
  const key = toStationKey(sessionId, stationId);
  const listeners = listenersByKey.get(key) ?? new Set<StationListener>();
  listeners.add(listener);
  listenersByKey.set(key, listeners);

  return () => {
    const nextListeners = listenersByKey.get(key);
    if (!nextListeners) {
      return;
    }

    nextListeners.delete(listener);
    if (nextListeners.size === 0) {
      listenersByKey.delete(key);
    }
  };
}
