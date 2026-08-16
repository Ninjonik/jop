import { sessionIdSchema, stationIdSchema } from '@/lib/station/domain';
import { subscribeToStation } from '@/lib/server/station-events';
import { stationService } from '@/lib/server/services/station-service';
import { jsonErrorResponse } from '@/lib/server/http';

export const runtime = 'nodejs';

interface StationEventsRouteProps {
  params: Promise<{
    sessionId: string;
    stationId: string;
  }>;
}

const encoder = new TextEncoder();

function formatSseEvent(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function GET(_request: Request, { params }: StationEventsRouteProps) {
  try {
    const { sessionId, stationId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const parsedStationId = stationIdSchema.parse(stationId);
    const station = await stationService.getStation(parsedSessionId, parsedStationId);

    if (!station) {
      return Response.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Station not found.',
          },
        },
        { status: 404 }
      );
    }

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(formatSseEvent('snapshot', { station }));

        const unsubscribe = subscribeToStation(parsedSessionId, parsedStationId, (nextStation) => {
          controller.enqueue(formatSseEvent('snapshot', { station: nextStation }));
        });

        const keepAlive = setInterval(() => {
          controller.enqueue(encoder.encode(': keepalive\n\n'));
        }, 15000);

        return () => {
          clearInterval(keepAlive);
          unsubscribe();
        };
      },
      cancel() {
        return undefined;
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
