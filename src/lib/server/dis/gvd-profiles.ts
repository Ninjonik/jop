import { stockProfileSchema } from '@/lib/dis/gvd-planning';
import { z } from 'zod';
import { getMongoDb } from '../mongo';
import { getDisUniverseId } from './places';

const identity = z.object({
  placeId: z.string().regex(/^[1-9]\d{0,31}$/),
  id: z.string().min(1).max(64),
});
export async function loadStockProfiles(placeId: string) {
  identity.parse({ placeId, id: 'read' });
  return (await getMongoDb())
    .collection('gvd_stock_profiles')
    .find({ placeId, universeId: getDisUniverseId() })
    .sort({ name: 1 })
    .toArray();
}
export async function saveStockProfile(body: unknown) {
  const { placeId, profile } = z
    .object({ placeId: identity.shape.placeId, profile: stockProfileSchema })
    .parse(body);
  const _id = JSON.stringify([getDisUniverseId(), placeId, profile.id]);
  // Timetables contain immutable profile snapshots, so a catalogue edit cannot
  // silently change an already planned train's physical assumptions.
  await (
    await getMongoDb()
  )
    .collection<{ _id: string } & typeof profile & { placeId: string; universeId: string }>(
      'gvd_stock_profiles',
    )
    .replaceOne({ _id }, { ...profile, placeId, universeId: getDisUniverseId() }, { upsert: true });
  return { profile };
}
export async function deleteStockProfile(body: unknown) {
  const { placeId, id } = identity.parse(body);
  await (
    await getMongoDb()
  )
    .collection('gvd_stock_profiles')
    .deleteOne({ placeId, id, universeId: getDisUniverseId() });
  return { deleted: true };
}
