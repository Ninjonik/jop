import type { Collection } from 'mongodb';

import type { PlaceTemplateDocument } from '@/lib/station/domain';

import { getMongoDb } from '../mongo';

let initialized = false;

async function getCollection(): Promise<Collection<PlaceTemplateDocument>> {
  const db = await getMongoDb();
  const collection = db.collection<PlaceTemplateDocument>('roblox_place_templates');
  if (!initialized) {
    initialized = true;
    try {
      await collection.dropIndex('placeId_1');
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('index not found')) {
        throw error;
      }
    }
    await collection.createIndex({ universeId: 1, placeId: 1 }, { unique: true });
  }
  return collection;
}

export const placeTemplateRepository = {
  async findByUniverseAndPlaceId(universeId: string, placeId: string) {
    const collection = await getCollection();
    return collection.findOne({ universeId, placeId });
  },

  async save(template: PlaceTemplateDocument) {
    const collection = await getCollection();
    await collection.replaceOne({ _id: template._id }, template, { upsert: true });
    return template;
  },
};
