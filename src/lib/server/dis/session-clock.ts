import { operatingClockParts, type SessionClockSnapshot } from '@/lib/dis/clock';
import { sessionIdSchema } from '@/lib/station/domain';
import { z } from 'zod';
import { getMongoDb } from '../mongo';
import { sessionRepository } from '../repositories/session-repository';
import { DisError } from './appwrite';
import { getDisUniverseId } from './places';

export const sessionClockCommandSchema = z.object({
  sessionId: sessionIdSchema,
  offsetMinutes: z.number().int().min(-1440).max(1440),
});
async function collection() {
  return (await getMongoDb()).collection<{
    _id: string;
    sessionId: string;
    universeId: string;
    offsetMinutes: number;
    updatedAt: string;
  }>('session_clocks');
}
async function requireSession(sessionId: string) {
  const session = await sessionRepository.findById(sessionId);
  if (
    !session ||
    session.status !== 'active' ||
    (session.interpreter.kind === 'roblox' && session.interpreter.universeId !== getDisUniverseId())
  )
    throw new DisError(404, 'Aktívna relácia neexistuje.');
}
/** Bridge callers already validate the session and server identity. */
export async function sessionClockSnapshot(sessionId: string): Promise<SessionClockSnapshot> {
  const universeId = getDisUniverseId();
  const stored = await (
    await collection()
  ).findOne({ _id: JSON.stringify([universeId, sessionId]) });
  const offsetMinutes = stored?.offsetMinutes ?? 0;
  const serverUnixMs = Date.now();
  return {
    sessionId,
    offsetMinutes,
    configured: !!stored,
    serverUnixMs,
    ...operatingClockParts(offsetMinutes, serverUnixMs),
  };
}
export async function getSessionClock(input: unknown) {
  const sessionId = sessionIdSchema.parse(input);
  await requireSession(sessionId);
  return { clock: await sessionClockSnapshot(sessionId) };
}
export async function setSessionClock(input: unknown) {
  const command = sessionClockCommandSchema.parse(input);
  await requireSession(command.sessionId);
  const universeId = getDisUniverseId();
  const _id = JSON.stringify([universeId, command.sessionId]);
  // Separate canonical records survive concurrent station and heartbeat saves.
  await (
    await collection()
  ).updateOne(
    { _id },
    {
      $set: {
        ...command,
        universeId,
        updatedAt: new Date().toISOString(),
      },
    },
    { upsert: true },
  );
  return { clock: await sessionClockSnapshot(command.sessionId) };
}
