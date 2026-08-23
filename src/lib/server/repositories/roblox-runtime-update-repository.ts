import type { Collection } from 'mongodb';

import type { RobloxPhysicalPieceState } from '@/lib/station/domain';

import { getMongoDb } from '../mongo';

export type RobloxRuntimeUpdateDocument = {
  _id: string;
  sessionId: string;
  sequence: number;
  stationId: string;
  pieceId: string;
  piece: RobloxPhysicalPieceState;
  createdAt: string;
};

async function getCollection(): Promise<Collection<RobloxRuntimeUpdateDocument>> {
  const db = await getMongoDb();
  return db.collection<RobloxRuntimeUpdateDocument>('roblox_runtime_updates');
}

export const robloxRuntimeUpdateRepository = {
  async insertMany(documents: RobloxRuntimeUpdateDocument[]) {
    if (documents.length === 0) {
      return;
    }

    const collection = await getCollection();
    await collection.insertMany(documents, { ordered: true });
  },

  async listAfterSequence(sessionId: string, afterSequence: number) {
    const collection = await getCollection();
    return collection
      .find({ sessionId, sequence: { $gt: afterSequence } })
      .sort({ sequence: 1 })
      .toArray();
  },

  async deleteUpToSequence(sessionId: string, sequence: number) {
    const collection = await getCollection();
    await collection.deleteMany({ sessionId, sequence: { $lte: sequence } });
  },

  async deleteBySessionId(sessionId: string) {
    const collection = await getCollection();
    await collection.deleteMany({ sessionId });
  },
};
