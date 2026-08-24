import type { Collection } from 'mongodb';

import type { SessionDocument } from '@/lib/station/domain';

import { getMongoDb } from '../mongo';

let initialized = false;

async function getCollection(): Promise<Collection<SessionDocument>> {
  const db = await getMongoDb();
  const collection = db.collection<SessionDocument>('sessions');

  if (!initialized) {
    initialized = true;
    await Promise.all([
      collection.createIndex({ status: 1, 'interpreter.kind': 1 }),
      collection.createIndex({ 'interpreter.kind': 1, 'interpreter.heartbeat.lastHeartbeatAt': -1 }),
    ]);
  }

  return collection;
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

  async listActiveRobloxSessions() {
    const collection = await getCollection();
    return collection
      .find({
        status: 'active',
        'interpreter.kind': 'roblox',
      })
      .sort({ 'interpreter.heartbeat.lastHeartbeatAt': -1, _id: 1 })
      .toArray();
  },
};
