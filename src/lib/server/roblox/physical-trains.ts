import { projectPhysicalTrainLabels } from '@/lib/station/physical-trains';
import { gsmRRepository } from '../repositories/gsm-r-repository';
import { sessionRepository } from '../repositories/session-repository';
import { stationRepository } from '../repositories/station-repository';

export async function loadPhysicalTrainLabels(sessionId: string) {
  const session = await sessionRepository.findById(sessionId);
  if (!session || session.interpreter.kind !== 'roblox') return {};
  const [vehicles, stations] = await Promise.all([
    gsmRRepository.list(sessionId),
    stationRepository.listBySessionId(sessionId),
  ]);
  return projectPhysicalTrainLabels(
    session,
    vehicles,
    Object.fromEntries(
      stations.map((station) => [
        station.stationId,
        Object.fromEntries(
          Object.entries(station.layout.pieces).map(([id, piece]) => [id, piece.type]),
        ),
      ]),
    ),
  );
}
export async function refreshPhysicalTrainLabels(sessionId: string) {
  const labels = await loadPhysicalTrainLabels(sessionId);
  const stations = await stationRepository.listBySessionId(sessionId);
  await Promise.all(
    stations.map((station) =>
      stationRepository.setPhysicalTrainLabels(station, labels[station.stationId] ?? {}),
    ),
  );
}
