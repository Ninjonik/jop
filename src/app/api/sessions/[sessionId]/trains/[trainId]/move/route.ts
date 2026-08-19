import { jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';
import { sessionIdSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';

interface TrainMoveRouteProps {
  params: Promise<{ sessionId: string; trainId: string }>;
}

export async function POST(_request: Request, { params }: TrainMoveRouteProps) {
  try {
    const { sessionId, trainId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const train = await stationService.moveMockTrain(parsedSessionId, trainId);
    return Response.json({ train }, { status: 202 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
