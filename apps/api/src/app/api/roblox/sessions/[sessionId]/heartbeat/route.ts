import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { assertRobloxRequestAuthorized } from '@/lib/server/roblox/roblox-auth';
import { stationService } from '@/lib/server/services/station-service';
import { robloxSessionHeartbeatSchema, sessionIdSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';

interface RobloxHeartbeatRouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: RobloxHeartbeatRouteProps) {
  try {
    assertRobloxRequestAuthorized(request);
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const body = await parseJsonRequest(request, robloxSessionHeartbeatSchema);
    const heartbeat = await stationService.heartbeatRobloxSession(parsedSessionId, body.serverId);
    return Response.json(heartbeat);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
