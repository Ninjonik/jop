import type { GsmRBinding, GsmRVehicle } from '@/lib/roblox/gsm-r';
import { createHash } from 'node:crypto';
import { getMongoDb } from '../mongo';

const vehicleKey = (sessionId: string, sensorId: string) =>
  createHash('sha256')
    .update(JSON.stringify([sessionId, sensorId]))
    .digest('hex');
async function collection() {
  const vehicles = (await getMongoDb()).collection<GsmRVehicle>('gsm_r_vehicles');
  // Partial indexes leave unregistered radios unconstrained. Mongo, rather than
  // the process-local bridge queue, arbitrates simultaneous registrations.
  await Promise.all([
    vehicles.createIndex({ sessionId: 1, sensorId: 1 }, { unique: true }),
    vehicles.createIndex(
      { sessionId: 1, 'binding.trainNumber': 1, 'binding.functionCode': 1 },
      { unique: true, partialFilterExpression: { 'binding.trainNumber': { $type: 'string' } } },
    ),
    vehicles.createIndex(
      { sessionId: 1, 'binding.driverId': 1 },
      { unique: true, partialFilterExpression: { 'binding.driverId': { $type: 'string' } } },
    ),
  ]);
  return vehicles;
}
export const gsmRRepository = {
  async list(sessionId: string) {
    return (await collection()).find({ sessionId }).toArray();
  },
  async initialize(sessionId: string, sensorIds: string[]) {
    const vehicles = await collection();
    await vehicles.bulkWrite(
      [...new Set(sensorIds)].map((sensorId) => ({
        updateOne: {
          filter: { _id: vehicleKey(sessionId, sensorId) },
          update: {
            $setOnInsert: {
              sessionId,
              sensorId,
              revision: 0,
              binding: null,
              updatedAt: new Date().toISOString(),
            },
          },
          upsert: true,
        },
      })),
    );
  },
  async setBinding(vehicle: GsmRVehicle, binding: GsmRBinding | null) {
    return (await collection()).findOneAndUpdate(
      { _id: vehicle._id, revision: vehicle.revision },
      { $set: { binding, updatedAt: new Date().toISOString() }, $inc: { revision: 1 } },
      { returnDocument: 'after' },
    );
  },
};
