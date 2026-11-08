/** Internal crossing controller; retain its layout/runtime and direct debug routes. */
export function isPublicStation(stationId: string) {
  return stationId.trim().toLowerCase() !== 'inter';
}
