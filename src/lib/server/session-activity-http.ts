import { sessionIdSchema } from '@/lib/station/domain';
import type { SessionActivitySource } from '@/lib/station/session-activity';
import { randomUUID } from 'node:crypto';
import { recordSessionActivity } from './session-activity';

type Props = { params: Promise<{ sessionId: string; stationId?: string }> };
function summarize(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  const body = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of [
    'commandId',
    'sessionId',
    'stationId',
    'serverId',
    'observedAt',
    'issuedAt',
    'traversalState',
    'controlSlot',
    'button',
    'control',
    'emergencyCancel',
    'expectedSelectionId',
    'eventId',
    'type',
    'pieceId',
    'occupied',
    'position',
    'applied',
    'kind',
    'afterSequence',
  ]) {
    const v = body[key];
    if (
      typeof v === 'boolean' ||
      typeof v === 'number' ||
      (typeof v === 'string' && v.length <= 160)
    )
      result[key] = v;
  }
  if (body.payload) result.payload = summarize(body.payload);
  if (Array.isArray(body.events)) {
    result.eventCount = body.events.length;
    result.events = body.events.slice(0, 40).map(summarize);
  }
  return result;
}

export function withSessionActivity<P extends Props>(
  source: SessionActivitySource,
  event: string,
  handler: (request: Request, props: P) => Promise<Response>,
) {
  return async (request: Request, props: P) => {
    const params = await props.params;
    if (!sessionIdSchema.safeParse(params.sessionId).success) return handler(request, props);
    const correlationId = randomUUID();
    const started = performance.now();
    const base = {
      sessionId: params.sessionId,
      stationId: params.stationId,
      source,
      correlationId,
    };
    recordSessionActivity({ ...base, event: `${event}.received`, level: 'info' });
    // Only known scalar fields are retained. Headers, credentials and raw error bodies are excluded.
    const summary =
      request.method === 'POST'
        ? request
            .clone()
            .json()
            .then(summarize)
            .catch(() => ({}))
        : Promise.resolve({});
    try {
      const response = await handler(request, props);
      const durationMs = Math.round(performance.now() - started);
      const recordedAt = new Date().toISOString();
      const failure = response.ok
        ? Promise.resolve({})
        : response
            .clone()
            .json()
            .then((body) => {
              const code = body?.error?.code;
              return typeof code === 'string' && /^[A-Z_]{1,80}$/.test(code)
                ? { errorCode: code }
                : {};
            })
            .catch(() => ({}));
      void Promise.all([summary, failure]).then(([details, failureDetails]) =>
        recordSessionActivity({
          ...base,
          recordedAt,
          event: `${event}.${response.ok ? 'completed' : 'failed'}`,
          level: response.ok ? 'info' : 'error',
          durationMs,
          details: { ...details, ...failureDetails, status: response.status },
        }),
      );
      return response;
    } catch (error) {
      recordSessionActivity({
        ...base,
        event: `${event}.failed`,
        level: 'error',
        durationMs: Math.round(performance.now() - started),
        details: { reason: 'unhandled-server-error' },
      });
      throw error;
    }
  };
}
