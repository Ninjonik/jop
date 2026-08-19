import type { Collection } from 'mongodb';

import type { SessionDocument } from '@/lib/station/domain';

import { getMongoDb } from '../mongo';

async function getCollection(): Promise<Collection<SessionDocument>> {
  const db = await getMongoDb();
  return db.collection<SessionDocument>('sessions');
}

export const sessionRepository = {
  async create(session: SessionDocument) {
    const collection = await getCollection();
    await collection.insertOne(session);
    return session;
  },

  async findById(sessionId: string) {
    const collection = await getCollection();
    return collection.findOne({ _id: sessionId });
  },

  async save(session: SessionDocument) {
    const collection = await getCollection();
    await collection.replaceOne({ _id: session._id }, session, { upsert: false });
    return session;
  },
};
