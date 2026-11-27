export type SessionActivitySource = 'command' | 'roblox' | 'server' | 'client';
export type SessionActivityEntry = {
  id: string;
  sessionId: string;
  stationId?: string;
  recordedAt: string;
  source: SessionActivitySource;
  event: string;
  level: 'info' | 'warning' | 'error';
  correlationId?: string;
  revision?: number;
  durationMs?: number;
  details?: Record<string, unknown>;
};
export type SessionActivityPage = { entries: SessionActivityEntry[]; nextCursor: string | null };
