import { z } from 'zod';

import type { StationDocument } from './domain';
import { sessionIdSchema, stationIdSchema } from './domain';

export const stationRealtimeSubscribeSchema = z.object({
  type: z.literal('subscribe'),
  sessionId: sessionIdSchema,
  stationId: stationIdSchema,
});

export type StationRealtimeSubscribeMessage = z.infer<typeof stationRealtimeSubscribeSchema>;

export interface StationRealtimeClientEvents {
  'station:subscribe': (subscription: StationRealtimeSubscribeMessage) => void;
}

export interface StationRealtimeServerEvents {
  'station:snapshot': (station: StationDocument) => void;
  'station:error': (message: string) => void;
}

export interface StationRealtimeSocketData {
  stationRoom?: string;
}

export function getStationSubscriptionKey(sessionId: string, stationId: string) {
  return JSON.stringify([sessionId, stationId]);
}
