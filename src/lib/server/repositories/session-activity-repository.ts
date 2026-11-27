import type { SessionActivityEntry, SessionActivityPage } from '@/lib/station/session-activity';
import { ObjectId } from 'mongodb';
import { getMongoDb } from '../mongo';

type ActivityDocument = Omit<SessionActivityEntry, 'id'> & { _id: ObjectId };
let indexes: Promise<unknown> | undefined;
async function collection() {
  const result = (await getMongoDb()).collection<ActivityDocument>('session_activity');
  indexes ??= result.createIndex({ sessionId: 1, _id: -1 }).catch((error) => {
    indexes = undefined;
    throw error;
  });
  await indexes;
  return result;
}
export const sessionActivityRepository = {
  async append(entries: Omit<SessionActivityEntry, 'id'>[]) {
    if (!entries.length) return;
    const db = await getMongoDb();
    const sessions = await db
      .collection('sessions')
      .find({
        _id: { $in: [...new Set(entries.map((entry) => entry.sessionId))] } as never,
        status: 'active',
      })
      .project({ _id: 1, interpreter: 1 })
      .toArray();
    const active = new Set(
      sessions
        .filter(
          (session) =>
            session.interpreter?.kind !== 'roblox' ||
            Date.parse(session.interpreter.heartbeat?.lastHeartbeatAt ?? '') > Date.now() - 60000,
        )
        .map((session) => String(session._id)),
    );
    const documents = entries
      .filter((entry) => active.has(entry.sessionId))
      .map((entry) => ({ ...entry, _id: new ObjectId() }));
    if (documents.length) await (await collection()).insertMany(documents, { ordered: false });
  },
  async list(sessionId: string, cursor?: string): Promise<SessionActivityPage> {
    const entries = await (
      await collection()
    )
      .find({ sessionId, ...(cursor ? { _id: { $lt: new ObjectId(cursor) } } : {}) })
      .sort({ _id: -1 })
      .limit(101)
      .toArray();
    const page = entries.slice(0, 100);
    return {
      entries: page.map(({ _id, ...entry }) => ({ ...entry, id: _id.toHexString() })),
      nextCursor: entries.length > 100 ? page.at(-1)!._id.toHexString() : null,
    };
  },
};
