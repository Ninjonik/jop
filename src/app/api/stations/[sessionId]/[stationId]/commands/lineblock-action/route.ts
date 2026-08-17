import {
  lineblockActionCommandSchema,
  sessionIdSchema,
  stationIdSchema,
} from '@/lib/station/domain';
import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

interface StationLineblockActionRouteProps {
  params: Promise<{
    sessionId: string;
    stationId: string;
  }>;
}

export async function POST(request: Request, { params }: StationLineblockActionRouteProps) {
  try {
    const { sessionId, stationId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const parsedStationId = stationIdSchema.parse(stationId);
    const command = await parseJsonRequest(request, lineblockActionCommandSchema);

    if (command.sessionId !== parsedSessionId || command.stationId !== parsedStationId) {
      return Response.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Route and payload station identity must match.',
          },
        },
        { status: 400 }
      );
    }

    const result = await stationService.submitLineblockAction(command);
    return Response.json(result, { status: 202 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
