const stationNames: Record<string, string> = {
  kolarovo: 'Kolárovo',
  vesele: 'Veselé',
};

export function getStationDisplayName(stationId: string) {
  const id = stationId.trim();
  return stationNames[id.toLowerCase()] || id.charAt(0).toLocaleUpperCase('sk') + id.slice(1);
}
