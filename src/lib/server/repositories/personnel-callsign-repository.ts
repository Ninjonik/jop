import { MongoServerError } from 'mongodb';
import { getMongoDb } from '../mongo';

type CallsignReservation = { _id: string; userId: string };
async function collection() {
  const collection = (await getMongoDb()).collection<CallsignReservation>('personnel_callsigns');
  await collection.createIndex({ userId: 1 }, { unique: true });
  return collection;
}
export const personnelCallsignRepository = {
  async findByUser(userId: string) {
    return (await (await collection()).findOne({ userId }))?._id ?? null;
  },
  async listNumbers() {
    return (await (await collection()).find({}).toArray()).map((item) => item._id);
  },
  async reserve(userId: string, number: string) {
    try {
      await (await collection()).insertOne({ _id: number, userId });
      return number;
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      // A concurrent callback may already have allocated this user's number.
      return this.findByUser(userId);
    }
  },
};
