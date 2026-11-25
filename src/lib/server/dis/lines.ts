import type { RailwayLine } from '@/lib/dis/lines';
import { railwayLineSchema } from '@/lib/dis/lines';
import { kamenanskoTransportPoints } from '@/lib/dis/transport-points';
import { isPublicStation } from '@/lib/station/visibility';
import { z } from 'zod';
import { getMongoDb } from '../mongo';
import { DisError } from './appwrite';
import { getDisPlaceTemplate, getDisUniverseId } from './places';
import { loadRailwayNetwork } from './railway-network';
async function collection() {
  return (await getMongoDb()).collection<RailwayLine & { _id: string; universeId: string }>(
    'railway_lines',
  );
}
export async function loadLines(placeId: string) {
  if (!/^[1-9]\d{0,31}$/.test(placeId)) throw new DisError(400, 'Vyberte platné miesto.');
  return (await collection())
    .find({ placeId, universeId: getDisUniverseId() })
    .sort({ name: 1 })
    .toArray();
}
export async function saveLine(body: unknown) {
  const line = railwayLineSchema.parse(body);
  const template = await getDisPlaceTemplate(line.placeId);
  const stations = new Set(
    template?.schema.stations.filter((s) => isPublicStation(s.stationId)).map((s) => s.stationId),
  );
  if (line.placeId === '113144512557419')
    for (const point of kamenanskoTransportPoints) stations.add(point.stationId);
  for (const point of (await loadRailwayNetwork(line.placeId)).network.points)
    stations.add(point.id);
  if (line.stations.some((id) => !stations.has(id)))
    throw new DisError(400, 'Trať môže obsahovať iba existujúce stanice vybranej siete.');
  const _id = JSON.stringify([getDisUniverseId(), line.placeId, line.id]);
  await (
    await collection()
  ).replaceOne({ _id }, { ...line, universeId: getDisUniverseId() }, { upsert: true });
  return { line };
}
export async function deleteLine(body: unknown) {
  // Parse the identity separately so deletion does not depend on old station definitions.
  const input = z
    .object({ id: z.uuid(), placeId: z.string().regex(/^[1-9]\d{0,31}$/) })
    .parse(body);
  await (
    await collection()
  ).deleteOne({ id: input.id, placeId: input.placeId, universeId: getDisUniverseId() });
  return { deleted: true };
}
