import type { Collection } from 'mongodb';

import type { StationDocument } from '@/lib/station/domain';

import { getMongoDb } from '../mongo';

let initialized = false;

async function getCollection(): Promise<Collection<StationDocument>> {
  const db = await getMongoDb();
  const collection = db.collection<StationDocument>('stations');

  if (!initialized) {
    initialized = true;
    await Promise.all([
      collection.createIndex({ sessionId: 1, stationId: 1 }, { unique: true }),
      collection.createIndex({ sessionId: 1 }),
    ]);
  }

  return collection;
}

export const stationRepository = {
  async create(station: StationDocument) {
    const collection = await getCollection();
    await collection.insertOne(station);
    return station;
  },

  async findBySessionAndStationId(sessionId: string, stationId: string) {
    const collection = await getCollection();
    return collection.findOne({ sessionId, stationId });
  },

  async listBySessionId(sessionId: string) {
    const collection = await getCollection();
    return collection.find({ sessionId }).sort({ stationId: 1 }).toArray();
  },

  async save(station: StationDocument) {
    const collection = await getCollection();
    await collection.replaceOne({ _id: station._id }, station, { upsert: false });
    return station;
  },
};
