import { renameStationSchema, sessionIdSchema, stationIdSchema } from '@/lib/station/domain';
import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
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

export async function PATCH(request: Request, { params }: StationRouteProps) {
  try {
    const { sessionId, stationId } = await params;
    const station = await stationService.renameStation(
      sessionIdSchema.parse(sessionId),
      stationIdSchema.parse(stationId),
      (await parseJsonRequest(request, renameStationSchema)).stationId,
    );
    return Response.json({ station });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: StationRouteProps) {
  try {
    const { sessionId, stationId } = await params;
    await stationService.removeStation(sessionIdSchema.parse(sessionId), stationIdSchema.parse(stationId));
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
