import { withSessionActivity } from '@/lib/server/session-activity-http';
import { jsonErrorResponse } from '@/lib/server/http';
import { assertRobloxRequestAuthorized } from '@/lib/server/roblox/roblox-auth';
import { stationService } from '@/lib/server/services/station-service';
import { sessionIdSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';

interface SnapshotRouteProps {
  params: Promise<{ sessionId: string }>;
}

async function handleGET(request: Request, { params }: SnapshotRouteProps) {
  try {
    assertRobloxRequestAuthorized(request);
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const snapshot = await stationService.getRobloxPhysicalSnapshot(parsedSessionId);
    return Response.json({ snapshot });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const GET = withSessionActivity('roblox', 'snapshot', handleGET);
