import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { assertRobloxRequestAuthorized } from '@/lib/server/roblox/roblox-auth';
import { stationService } from '@/lib/server/services/station-service';
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
    const init = await stationService.getRobloxRuntimeInit(body.sessionId);
    return Response.json(init, { status: 201 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
