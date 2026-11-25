import {
  railwayNetworkSchema,
  seedRailwayNetwork,
  type NetworkSnapshot,
} from '@/lib/dis/railway-network';
import { z } from 'zod';
import { getMongoDb } from '../mongo';
import { DisError } from './appwrite';
import { getDisPlaceTemplate, getDisUniverseId } from './places';
const placeSchema = z.string().regex(/^[1-9]\d{0,31}$/);
async function collection() {
  return (await getMongoDb()).collection<NetworkSnapshot & { _id: string }>('railway_networks');
}
export async function loadRailwayNetwork(input: unknown): Promise<NetworkSnapshot> {
  const placeId = placeSchema.parse(input);
  if (!(await getDisPlaceTemplate(placeId)))
    throw new DisError(404, 'Miesto nemá uloženú konfiguráciu.');
  return (
    (await (
      await collection()
    ).findOne({ _id: JSON.stringify([getDisUniverseId(), placeId]) })) || {
      network: seedRailwayNetwork(placeId),
      updatedAt: null,
    }
  );
}
export async function saveRailwayNetwork(input: unknown) {
  const command = z
    .object({
      placeId: placeSchema,
      network: railwayNetworkSchema,
      expectedUpdatedAt: z.string().nullable(),
    })
    .parse(input);
  await loadRailwayNetwork(command.placeId);
  const _id = JSON.stringify([getDisUniverseId(), command.placeId]);
  const updatedAt = new Date().toISOString();
  try {
    const result = await (
      await collection()
    ).updateOne(
      { _id, updatedAt: command.expectedUpdatedAt },
      { $set: { network: command.network, updatedAt } },
      { upsert: command.expectedUpdatedAt === null },
    );
    if (!result.matchedCount && !result.upsertedCount)
      throw new DisError(409, 'Sieť medzitým zmenil iný používateľ. Obnovte ju pred uložením.');
  } catch (e) {
    if ((e as { code?: number }).code === 11000)
      throw new DisError(409, 'Sieť medzitým zmenil iný používateľ. Obnovte ju pred uložením.');
    throw e;
  }
  return { network: command.network, updatedAt };
}
