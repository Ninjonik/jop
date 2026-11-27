import { withSessionActivity } from '@/lib/server/session-activity-http';
import { authorizeDispatcherStationCommand } from '@/lib/server/dis/station-command';
import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';
import { resetReservationsCommandSchema, sessionIdSchema, stationIdSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';

interface ResetReservationsRouteProps {
  params: Promise<{ sessionId: string; stationId: string }>;
}

async function handlePOST(request: Request, { params }: ResetReservationsRouteProps) {
  try {
    const { sessionId, stationId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const parsedStationId = stationIdSchema.parse(stationId);
    const profile = await authorizeDispatcherStationCommand(request, parsedSessionId, parsedStationId);
    const command = await parseJsonRequest(request, resetReservationsCommandSchema);
    if (profile) command.actor = { type: 'user', id: profile.userId };
    if (command.sessionId !== parsedSessionId || command.stationId !== parsedStationId) {
      return Response.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Reset command station identity must match.' } },
        { status: 400 },
      );
    }

    const station = await stationService.resetReservations(command);
    return Response.json({ station }, { status: 202 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const POST = withSessionActivity('command', 'reset-reservations', handlePOST);
