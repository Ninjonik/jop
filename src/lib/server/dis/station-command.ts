import { sessionRepository } from '../repositories/session-repository';
import { dispatchers, requireDisProfile } from './appwrite';
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

/** A reservation reset is a dispatcher recovery control, not a generic station action. */
export async function authorizeDispatcherStationCommand(
  request: Request,
  sessionId: string,
  stationId: string,
) {
  const session = await sessionRepository.findById(sessionId);
  if (session?.interpreter.kind === 'mock') return;
  const profile = await requireDisProfile(request, dispatchers);
  await requireStationClaim(sessionId, stationId, profile);
  return profile;
}
