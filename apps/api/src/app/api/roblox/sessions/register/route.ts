import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { assertRobloxRequestAuthorized } from '@/lib/server/roblox/roblox-auth';
import { stationService } from '@/lib/server/services/station-service';
import { recordSessionActivity } from '@/lib/server/session-activity';
import { robloxSessionRegistrationSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertRobloxRequestAuthorized(request);
    const body = await parseJsonRequest(request, robloxSessionRegistrationSchema);
    await stationService.registerRobloxSession(
      body.sessionId,
      body.universeId,
      body.placeId,
      body.serverId,
    );
    recordSessionActivity({
      sessionId: body.sessionId,
      source: 'roblox',
      event: 'session.registered',
      level: 'info',
      details: { universeId: body.universeId, placeId: body.placeId },
    });
    const init = await stationService.getRobloxRuntimeInit(body.sessionId);
    return Response.json(init, { status: 201 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
