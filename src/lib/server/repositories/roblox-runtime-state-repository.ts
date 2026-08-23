import type { Collection } from 'mongodb';

import type { RobloxPhysicalSnapshot } from '@/lib/station/domain';

import { getMongoDb } from '../mongo';

export type RobloxRuntimeStateDocument = {
  _id: string;
  sessionId: string;
  latestSequence: number;
  lastSnapshot: RobloxPhysicalSnapshot;
  createdAt: string;
  updatedAt: string;
};

async function getCollection(): Promise<Collection<RobloxRuntimeStateDocument>> {
  const db = await getMongoDb();
  return db.collection<RobloxRuntimeStateDocument>('roblox_runtime_state');
}

export const robloxRuntimeStateRepository = {
  async findBySessionId(sessionId: string) {
    const collection = await getCollection();
    return collection.findOne({ _id: sessionId });
  },

  async save(document: RobloxRuntimeStateDocument) {
    const collection = await getCollection();
    await collection.replaceOne({ _id: document._id }, document, { upsert: true });
    return document;
  },

  async deleteBySessionId(sessionId: string) {
    const collection = await getCollection();
    await collection.deleteOne({ _id: sessionId });
  },
};
