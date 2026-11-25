import { kamenanskoTransportPoints } from '@/lib/dis/transport-points';

const stationNames: Record<string, string> = {
  ...Object.fromEntries(kamenanskoTransportPoints.map((point) => [point.stationId, point.name])),
  kolarovo: 'Kolárovo',
  vesele: 'Veselé',
};

export function getStationDisplayName(stationId: string) {
  const id = stationId.trim();
  return stationNames[id.toLowerCase()] || id.charAt(0).toLocaleUpperCase('sk') + id.slice(1);
}
