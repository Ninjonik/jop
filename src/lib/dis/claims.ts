import { sessionIdSchema, stationIdSchema } from '@/lib/station/domain';
import { z } from 'zod';
export const CLAIM_LEASE_MS = 60_000;
export const stationClaimSchema = z.object({
  sessionId: sessionIdSchema,
  stationId: stationIdSchema,
});
export type StationClaim = {
  _id: string;
  sessionId: string;
  stationId: string;
  userId: string;
  userName: string;
  expiresAt: number;
};
