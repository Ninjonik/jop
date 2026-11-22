import { authorizeStationCommand } from '@/lib/server/dis/station-command';
import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';
import {
  privolavaciaInteractCommandSchema,
  sessionIdSchema,
  stationIdSchema,
} from '@/lib/station/domain';

export const runtime = 'nodejs';

interface StationPrivolavaciaInteractRouteProps {
  params: Promise<{
    sessionId: string;
    stationId: string;
  }>;
}

export async function POST(request: Request, { params }: StationPrivolavaciaInteractRouteProps) {
  try {
    const { sessionId, stationId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const parsedStationId = stationIdSchema.parse(stationId);
    const profile = await authorizeStationCommand(request, parsedSessionId, parsedStationId);
    const command = await parseJsonRequest(request, privolavaciaInteractCommandSchema);
    if (profile) command.actor = { type: 'user', id: profile.userId };

    if (command.sessionId !== parsedSessionId || command.stationId !== parsedStationId) {
      return Response.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'PN command and payload station identity must match.',
          },
        },
        { status: 400 },
      );
    }

    const result = await stationService.submitPrivolavaciaInteract(command);
    const station = await stationService.getStation(parsedSessionId, parsedStationId);
    return Response.json({ ...result, station }, { status: 202 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
