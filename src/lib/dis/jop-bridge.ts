import { getMongoDb } from '@/lib/server/mongo';
import type { StationDocument } from '@/lib/station/domain';
import { isPublicStation } from '@/lib/station/visibility';

export const getJopDb = getMongoDb;

export type JopStationSummary = {
  sessionId: string;
  stationId: string;
  name: string;
  trackCount: number;
  tracks: { pieceId: string; type: string; label?: string; hasPlatform: boolean }[];
};

export async function listJopStations(includeClosed = false): Promise<JopStationSummary[]> {
  const db = await getMongoDb();
  const sessions = await db
    .collection('sessions')
    .find(includeClosed ? {} : { status: 'active' }, { projection: { _id: 1 } })
    .toArray();
  const stations = await db
    .collection<StationDocument>('stations')
    .find({ sessionId: { $in: sessions.map((session) => String(session._id)) } })
    .toArray();
  return stations
    .filter((station) => isPublicStation(station.stationId))
    .map((station) => {
      const tracks = Object.entries(station.layout.pieces)
        .filter(([, piece]) => /track|peron|platform/.test(piece.type))
        .map(([pieceId, piece]) => ({
          pieceId,
          type: piece.type,
          label: Object.values(piece.state.texts).join(' ') || pieceId,
          hasPlatform: /peron|platform/.test(piece.type),
        }));
      return {
        sessionId: station.sessionId,
        stationId: station.stationId,
        name: station.stationId,
        trackCount: tracks.length,
        tracks,
      };
    });
}
