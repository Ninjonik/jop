import type { Collection } from 'mongodb';

import type { PlaceTemplateDocument } from '@/lib/station/domain';

import { getMongoDb } from '../mongo';

async function getCollection(): Promise<Collection<PlaceTemplateDocument>> {
  const db = await getMongoDb();
  const collection = db.collection<PlaceTemplateDocument>('roblox_place_templates');
  await collection.createIndex({ placeId: 1 }, { unique: true });
  return collection;
}

export const placeTemplateRepository = {
  async findByPlaceId(placeId: string) {
    const collection = await getCollection();
    return collection.findOne({ placeId });
  },

  async save(template: PlaceTemplateDocument) {
    const collection = await getCollection();
    await collection.replaceOne({ _id: template._id }, template, { upsert: true });
    return template;
  },
};
