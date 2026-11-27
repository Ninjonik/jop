import { stationRepository } from '../repositories/station-repository';

/** Wait on the server so a dependent click does not depend on the browser staying open. */
export async function waitForRouteSelection(
  sessionId: string,
  stationId: string,
  commandId: string,
) {
  const deadline = Date.now() + 12000;
  while (true) {
    const station = await stationRepository.findBySessionAndStationId(sessionId, stationId);
    if (!station) throw new Error('Station not found.');
    const selection = station.runtime.routeSelection;
    if (selection?.commandId === commandId) return;
    if (selection || Date.now() >= deadline) {
      throw new Error('The route selection was not confirmed. Select the route again.');
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
