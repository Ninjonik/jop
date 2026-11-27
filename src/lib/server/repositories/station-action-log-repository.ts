import type { Collection } from 'mongodb';
import { recordSessionActivity } from '../session-activity';

import type { StationActionLogDocument } from '@/lib/station/domain';

import { getMongoDb } from '../mongo';

let initialized = false;

async function getCollection(): Promise<Collection<StationActionLogDocument>> {
  const db = await getMongoDb();
  const collection = db.collection<StationActionLogDocument>('station_actions');

  if (!initialized) {
    initialized = true;
    await Promise.all([
      collection.createIndex({ sessionId: 1, stationId: 1 }),
      collection.createIndex({ actionId: 1 }),
    ]);
  }

  return collection;
}

export const stationActionLogRepository = {
  async create(actionLog: StationActionLogDocument) {
    const collection = await getCollection();
    await collection.insertOne(actionLog);
    recordSessionActivity({
      sessionId: actionLog.sessionId,
      stationId: actionLog.stationId,
      source: 'server',
      event: `action.${actionLog.status}`,
      level: actionLog.status === 'failed' ? 'error' : 'info',
      correlationId: actionLog.actionId,
      details: {
        actionType: actionLog.type,
        finishedAt: actionLog.finishedAt,
        errorCode: actionLog.error?.code,
      },
    });
    return actionLog;
  },

  async listByStation(sessionId: string, stationId: string) {
    const collection = await getCollection();
    return collection.find({ sessionId, stationId }).sort({ finishedAt: -1 }).limit(50).toArray();
  },
};
