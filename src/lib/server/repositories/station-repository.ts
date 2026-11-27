import type { PhysicalTrainLabels } from '@/lib/station/physical-trains';
import type { Collection } from 'mongodb';
import { recordSessionActivity } from '../session-activity';

import type { StationDocument } from '@/lib/station/domain';

import { getMongoDb } from '../mongo';

const observedStates = new WeakMap<StationDocument, Map<string, string>>();
function pieceStates(station: StationDocument) {
  return new Map(
    Object.entries(station.layout.pieces).map(([id, piece]) => [
      id,
      JSON.stringify(piece.state.groups),
    ]),
  );
}

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
    const station = await collection.findOne({ sessionId, stationId });
    if (station) observedStates.set(station, pieceStates(station));
    return station;
  },

  async listBySessionId(sessionId: string) {
    const collection = await getCollection();
    return collection.find({ sessionId }).sort({ stationId: 1 }).toArray();
  },

  async listAll() {
    const collection = await getCollection();
    return collection.find({}).sort({ sessionId: 1, stationId: 1 }).toArray();
  },

  async setPhysicalTrainLabels(station: StationDocument, labels: PhysicalTrainLabels) {
    if (JSON.stringify(station.runtime.physicalTrainLabels ?? {}) === JSON.stringify(labels))
      return;
    await (
      await getCollection()
    ).updateOne(
      { _id: station._id },
      {
        $set: { 'runtime.physicalTrainLabels': labels, updatedAt: new Date().toISOString() },
        $inc: { revision: 1 },
      },
    );
  },

  async save(station: StationDocument) {
    const collection = await getCollection();
    await collection.replaceOne({ _id: station._id }, station, { upsert: false });
    const previous = observedStates.get(station);
    const current = pieceStates(station);
    const changed = [...current].filter(([id, state]) => previous?.get(id) !== state);
    observedStates.set(station, current);
    recordSessionActivity({
      sessionId: station.sessionId,
      stationId: station.stationId,
      source: 'server',
      event: 'station.persisted',
      level: 'info',
      revision: station.revision,
      details: {
        comparedWithPreviousRead: !!previous,
        changedPieceCount: changed.length,
        changedPieces: changed
          .slice(0, 40)
          .map(([pieceId, groups]) => ({ pieceId, groups: JSON.parse(groups) })),
        selection: station.runtime.routeSelection?.sourcePieceId ?? null,
        selectionCommandId: station.runtime.routeSelection?.commandId ?? null,
        actions: Object.values(station.runtime.pendingActions)
          .slice(0, 40)
          .map((action) => ({
            id: action.id,
            type: action.type,
            status: action.status,
            dueAt: action.dueAt,
          })),
        activeRoutes: Object.keys(station.runtime.activeTrainRoutes).slice(0, 40),
      },
    });
    return station;
  },

  async removeBySessionAndStationId(sessionId: string, stationId: string) {
    const collection = await getCollection();
    await collection.deleteOne({ sessionId, stationId });
  },
};
