import type { UserProfile } from '@/lib/dis/appwrite-client';
import { CLAIM_LEASE_MS, stationClaimSchema, type StationClaim } from '@/lib/dis/claims';
import type { DriverTrain } from '@/lib/dis/driver-train';
import { canAssignShiftRole } from '@/lib/dis/shift-plan';
import { sessionIdSchema } from '@/lib/station/domain';
import { isPublicStation } from '@/lib/station/visibility';
import { MongoServerError } from 'mongodb';
import { getMongoDb } from '../mongo';
import { sessionRepository } from '../repositories/session-repository';
import { stationRepository } from '../repositories/station-repository';
import { isRobloxSessionLive } from '../services/station-service';
import { DisError } from './appwrite';

async function claims() {
  return (await getMongoDb()).collection<StationClaim>('session_station_claims');
}
export async function requireLiveSession(sessionId: string) {
  const session = await sessionRepository.findById(sessionId);
  if (
    !session ||
    session.status !== 'active' ||
    (session.interpreter.kind === 'roblox' && !isRobloxSessionLive(session))
  )
    throw new DisError(409, 'Relácia už nie je aktívna.');
  return session;
}
export async function listStationClaims(sessionId: string) {
  sessionIdSchema.parse(sessionId);
  await requireLiveSession(sessionId);
  return (await claims()).find({ sessionId, expiresAt: { $gt: Date.now() } }).toArray();
}
export async function claimStation(body: unknown, profile: UserProfile) {
  const scope = stationClaimSchema.parse(body);
  if (!canAssignShiftRole(profile, 'dispatcher'))
    throw new DisError(403, 'Stanicu môže prevziať iba výpravca.');
  await requireLiveSession(scope.sessionId);
  if (
    !isPublicStation(scope.stationId) ||
    !(await stationRepository.findBySessionAndStationId(scope.sessionId, scope.stationId))
  )
    throw new DisError(404, 'Stanica neexistuje.');
  const now = Date.now();
  const claim: StationClaim = {
    ...scope,
    _id: JSON.stringify([scope.sessionId, scope.stationId]),
    userId: profile.userId,
    userName: profile.name,
    expiresAt: now + CLAIM_LEASE_MS,
  };
  try {
    await (
      await claims()
    ).findOneAndUpdate(
      { _id: claim._id, $or: [{ userId: profile.userId }, { expiresAt: { $lte: now } }] },
      { $set: claim },
      { upsert: true },
    );
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000)
      throw new DisError(409, 'Stanicu už ovláda iný výpravca.');
    throw error;
  }
  return { claim };
}
export async function releaseStation(body: unknown, profile: UserProfile) {
  const scope = stationClaimSchema.parse(body);
  await (await claims()).deleteOne({ ...scope, userId: profile.userId });
  return { released: true };
}
export async function requireStationClaim(
  sessionId: string,
  stationId: string,
  profile: UserProfile,
) {
  await requireLiveSession(sessionId);
  if (
    !canAssignShiftRole(profile, 'dispatcher') ||
    !(await (
      await claims()
    ).findOne({ sessionId, stationId, userId: profile.userId, expiresAt: { $gt: Date.now() } }))
  )
    throw new DisError(403, 'Najprv prevezmite ovládanie stanice.');
}
// The existing authenticated voice heartbeat also renews operation leases. An
// expired lease cannot be resurrected by a late packet or another browser tab.
export async function renewOperationClaims(sessionId: string, userId: string) {
  await requireLiveSession(sessionId);
  const now = Date.now();
  const db = await getMongoDb();
  await Promise.all([
    (await claims()).updateMany(
      { sessionId, userId, expiresAt: { $gt: now } },
      { $set: { expiresAt: now + CLAIM_LEASE_MS } },
    ),
    db
      .collection<DriverTrain>('session_driver_trains')
      .updateMany(
        { sessionId, userId, expiresAt: { $gt: now } },
        { $set: { expiresAt: now + CLAIM_LEASE_MS } },
      ),
  ]);
}
