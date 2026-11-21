import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';
import { createMockTrainSchema, sessionIdSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';

interface TrainCollectionRouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: TrainCollectionRouteProps) {
  try {
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const input = await parseJsonRequest(request, createMockTrainSchema);
    const train = await stationService.createMockTrain(parsedSessionId, input);
    return Response.json({ train }, { status: 201 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
