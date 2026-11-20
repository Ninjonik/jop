import { getStationDisplayName } from '@/lib/station/display-name';
import { MongoServerError } from 'mongodb';
import { getMongoDb } from '../mongo';

type RadioZone = {
  _id: string;
  universeId: string;
  placeId: string;
  stationId: string;
  zone: string;
};
export async function loadRadioZones(universeId: string, placeId: string, stationIds: string[]) {
  const collection = (await getMongoDb()).collection<RadioZone>('radio_station_zones');
  await collection.createIndex({ universeId: 1, placeId: 1, zone: 1 }, { unique: true });
  const zones = new Map(
    (await collection.find({ universeId, placeId }).toArray()).map((record) => [
      record.stationId,
      record.zone,
    ]),
  );
  for (const stationId of [...stationIds].sort()) {
    if (zones.has(stationId)) continue;
    const initial =
      getStationDisplayName(stationId)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .match(/[A-Z]/)?.[0] ?? 'R';
    for (let number = 1; number <= 999; number++) {
      const zone = stationId === 'inter' ? '00' : `${initial}${number}`;
      const _id = JSON.stringify([universeId, placeId, stationId]);
      try {
        await collection.insertOne({ _id, universeId, placeId, stationId, zone });
        zones.set(stationId, zone);
        break;
      } catch (error) {
        if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
        const existing = await collection.findOne({ _id });
        if (existing) {
          zones.set(stationId, existing.zone);
          break;
        }
        if (stationId === 'inter' || number === 999)
          throw new Error('Nemožno prideliť rádiovú zónu stanice.');
      }
    }
  }
  return zones;
}
