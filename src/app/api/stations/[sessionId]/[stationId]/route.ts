import { sessionIdSchema, stationIdSchema } from '@/lib/station/domain';
import { jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

interface StationRouteProps {
  params: Promise<{
    sessionId: string;
    stationId: string;
  }>;
}

export async function GET(_request: Request, { params }: StationRouteProps) {
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

    return Response.json({ station });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
