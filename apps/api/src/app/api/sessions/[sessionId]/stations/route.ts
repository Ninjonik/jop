import { sessionIdSchema } from '@/lib/station/domain';
import { jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

interface SessionStationsRouteProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function GET(_request: Request, { params }: SessionStationsRouteProps) {
  try {
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const stations = await stationService.listStations(parsedSessionId);
    return Response.json({ stations });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
