import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { assertRobloxRequestAuthorized } from '@/lib/server/roblox/roblox-auth';
import { stationService } from '@/lib/server/services/station-service';
import { robloxOccupationEventSchema, sessionIdSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';

interface OccupationRouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: OccupationRouteProps) {
  try {
    assertRobloxRequestAuthorized(request);
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const body = await parseJsonRequest(request, robloxOccupationEventSchema);
    const result = await stationService.applyRobloxOccupation(parsedSessionId, body);
    return Response.json({ applied: result.applied });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
