import { getMongoDb } from '../mongo';
import { sessionRepository } from '../repositories/session-repository';
import { isRobloxSessionLive } from '../services/station-service';

/** Session artefacts have no meaning after the Roblox server ends. */
export async function pruneSessionArtifacts() {
  const db = await getMongoDb();
  const collections = [
    'session_station_claims',
    'session_driver_trains',
    'station_reminders',
    'session_timetables',
    'session_clocks',
  ].map((name) => db.collection(name));
  const sessionIds = new Set(
    (
      await Promise.all(collections.map((collection) => collection.distinct<string>('sessionId')))
    ).flat(),
  );
  for (const sessionId of sessionIds) {
    const session = await sessionRepository.findById(sessionId);
    if (
      !session ||
      session.status !== 'active' ||
      (session.interpreter.kind === 'roblox' && !isRobloxSessionLive(session))
    )
      await Promise.all(collections.map((collection) => collection.deleteMany({ sessionId })));
  }
  const now = Date.now();
  await Promise.all(
    collections
      .slice(0, 2)
      .map((collection) => collection.deleteMany({ expiresAt: { $lte: now } })),
  );
}
