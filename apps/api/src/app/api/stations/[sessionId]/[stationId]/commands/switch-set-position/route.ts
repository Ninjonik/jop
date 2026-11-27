import { withSessionActivity } from '@/lib/server/session-activity-http';
import { authorizeStationCommand } from '@/lib/server/dis/station-command';
import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';
import { switchSetPositionCommandSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';

async function handlePOST(request: Request) {
  try {
    const command = await parseJsonRequest(request, switchSetPositionCommandSchema);
    const profile = await authorizeStationCommand(request, command.sessionId, command.stationId);
    if (profile) command.actor = { type: 'user', id: profile.userId };
    const action = await stationService.submitSwitchSetPosition(command);
    const station = await stationService
      .getStation(command.sessionId, command.stationId)
      .catch(() => null);
    return Response.json({ action, station }, { status: 202 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const POST = withSessionActivity('command', 'switch-set-position', handlePOST);
