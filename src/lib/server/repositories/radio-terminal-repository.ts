import type { RadioAction, RadioTerminalState } from '@/lib/dis/radio';
import { MongoServerError } from 'mongodb';
import { getMongoDb } from '../mongo';

export type RadioTerminalDocument = RadioTerminalState & { _id: string };
export type RadioControlCommand = {
  _id: string;
  sessionId: string;
  userId: string;
  sensorId: string;
  actorUserId: string;
  action: RadioAction;
  createdAt: number;
  expiresAt: number;
  status: 'queued' | 'processing' | 'done';
  error?: string;
};
async function terminals() {
  return (await getMongoDb()).collection<RadioTerminalDocument>('radio_terminals');
}
async function commands() {
  const collection = (await getMongoDb()).collection<RadioControlCommand>('radio_control_commands');
  await collection.createIndex({ status: 1, createdAt: 1 });
  return collection;
}
export const radioTerminalRepository = {
  async claim(userId: string, state: RadioTerminalState, now: number) {
    try {
      return await (
        await terminals()
      ).findOneAndUpdate(
        {
          _id: userId,
          $or: [
            { ownerSocketId: state.ownerSocketId },
            { ownerSocketId: null },
            { expiresAt: { $lte: now } },
          ],
        },
        { $set: state },
        { upsert: true, returnDocument: 'after' },
      );
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) return null;
      throw error;
    }
  },
  async save(userId: string, ownerSocketId: string, state: RadioTerminalState) {
    return (await terminals()).updateOne({ _id: userId, ownerSocketId }, { $set: state });
  },
  async find(userId: string) {
    return (await terminals()).findOne({ _id: userId });
  },
  async enqueue(command: RadioControlCommand) {
    const collection = await commands();
    await collection.updateOne({ _id: command._id }, { $setOnInsert: command }, { upsert: true });
    return collection.findOne({ _id: command._id });
  },
  async takeCommands() {
    const collection = await commands();
    const pending = await collection
      .find({ status: 'queued' })
      .sort({ createdAt: 1 })
      .limit(50)
      .toArray();
    const claimed: RadioControlCommand[] = [];
    for (const command of pending) {
      const result = await collection.updateOne(
        { _id: command._id, status: 'queued' },
        { $set: { status: 'processing' } },
      );
      if (result.modifiedCount) claimed.push(command);
    }
    return claimed;
  },
  async finishCommand(id: string, error?: string) {
    await (
      await commands()
    ).updateOne({ _id: id }, { $set: { status: 'done', ...(error ? { error } : {}) } });
  },
  async pruneCommands(now: number) {
    await (await commands()).deleteMany({ expiresAt: { $lt: now - 60_000 } });
  },
};
