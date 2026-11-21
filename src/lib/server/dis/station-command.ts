import { sessionRepository } from '../repositories/session-repository';
import { requireDisProfile } from './appwrite';
import { requireStationClaim } from './claims';
export async function authorizeStationCommand(
  request: Request,
  sessionId: string,
  stationId: string,
) {
  const session = await sessionRepository.findById(sessionId);
  if (session?.interpreter.kind === 'mock') return;
  const profile = await requireDisProfile(request);
  await requireStationClaim(sessionId, stationId, profile);
  return profile;
}
