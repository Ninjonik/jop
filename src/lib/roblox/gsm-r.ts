import { radioActions } from '@/lib/dis/radio';
import { z } from 'zod';

const sensorId = z.string().uuid();
const robloxUserId = z.string().regex(/^[1-9]\d{0,15}$/);
export const gsmRCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('radio-action'),
    sensorId,
    actorUserId: robloxUserId,
    action: z.enum(radioActions),
    commandId: z.uuid(),
  }),
  z.object({ type: z.literal('initialize'), sensorIds: z.array(sensorId).min(1).max(500) }),
  z.object({
    type: z.literal('register'),
    sensorId,
    actorUserId: robloxUserId,
    driverId: z.string().regex(/^(?!000)\d{3}$/),
    trainNumber: z.string().regex(/^\d{1,6}$/),
    functionCode: z.enum(['01', '02', '03', '04', '05']),
    expectedRevision: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('deregister'),
    sensorId,
    actorUserId: robloxUserId,
    expectedRevision: z.number().int().nonnegative(),
  }),
]);
export type GsmRCommand = z.infer<typeof gsmRCommandSchema>;
export type GsmRBinding = {
  /** Stable Roblox identity; retained for legacy registration compatibility. */
  driverId: string;
  driverCallsign?: string;
  userId: string;
  timetableId: string | null;
  trainNumber: string;
  trainType: string;
  functionCode: string;
};
export type GsmRVehicle = {
  _id: string;
  sessionId: string;
  sensorId: string;
  revision: number;
  binding: GsmRBinding | null;
  updatedAt: string;
};
