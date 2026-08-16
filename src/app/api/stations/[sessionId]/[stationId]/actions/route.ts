import { sessionIdSchema, stationIdSchema } from '@/lib/station/domain';
import { jsonErrorResponse } from '@/lib/server/http';
import { stationActionLogRepository } from '@/lib/server/repositories/station-action-log-repository';

export const runtime = 'nodejs';

interface StationActionsRouteProps {
  params: Promise<{
    sessionId: string;
    stationId: string;
  }>;
}

export async function GET(_request: Request, { params }: StationActionsRouteProps) {
  try {
    const { sessionId, stationId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const parsedStationId = stationIdSchema.parse(stationId);
    const actions = await stationActionLogRepository.listByStation(parsedSessionId, parsedStationId);
    return Response.json({ actions });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
