import { jsonErrorResponse } from '@/lib/server/http';
import { assertRobloxRequestAuthorized } from '@/lib/server/roblox/roblox-auth';
import { stationService } from '@/lib/server/services/station-service';
import {
  robloxOccupationBatchSchema,
  robloxOccupationEventSchema,
  sessionIdSchema,
} from '@/lib/station/domain';

export const runtime = 'nodejs';

const sessionOccupationQueues = new Map<string, Promise<unknown>>();

function queueSessionOccupationRequest<T>(sessionId: string, operation: () => Promise<T>) {
  const previous = sessionOccupationQueues.get(sessionId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  sessionOccupationQueues.set(sessionId, next);
  const cleanup = () => {
    if (sessionOccupationQueues.get(sessionId) === next) {
      sessionOccupationQueues.delete(sessionId);
    }
  };
  void next.then(cleanup, cleanup);
  return next;
}

interface OccupationRouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: OccupationRouteProps) {
  try {
    assertRobloxRequestAuthorized(request);
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const rawBody = await request.json();

    return await queueSessionOccupationRequest(parsedSessionId, async () => {
      const batchParse = robloxOccupationBatchSchema.safeParse(rawBody);
      if (batchParse.success) {
        // Serialize both events within a batch and overlapping HTTP batches.
        // Each read-modify-write must observe all earlier sensor transitions or
        // a later crossover event can restore already-released reservations.
        const results = [];
        for (const event of batchParse.data.events) {
          results.push(await stationService.applyRobloxOccupation(parsedSessionId, event));
        }
        return Response.json({ applied: results.some((result) => result.applied) });
      }

      const body = robloxOccupationEventSchema.parse(rawBody);
      const result = await stationService.applyRobloxOccupation(parsedSessionId, body);
      return Response.json({ applied: result.applied });
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
