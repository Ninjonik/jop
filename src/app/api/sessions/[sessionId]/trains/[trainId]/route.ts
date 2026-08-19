import { jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';
import { sessionIdSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';

interface TrainRouteProps {
  params: Promise<{ sessionId: string; trainId: string }>;
}

export async function DELETE(_request: Request, { params }: TrainRouteProps) {
  try {
    const { sessionId, trainId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const result = await stationService.removeMockTrain(parsedSessionId, trainId);
    return Response.json(result);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
