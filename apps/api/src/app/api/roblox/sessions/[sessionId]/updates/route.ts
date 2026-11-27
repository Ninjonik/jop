import { withSessionActivity } from '@/lib/server/session-activity-http';
import { jsonErrorResponse } from '@/lib/server/http';
import { assertRobloxRequestAuthorized } from '@/lib/server/roblox/roblox-auth';
import { stationService } from '@/lib/server/services/station-service';
import { robloxUpdateCursorSchema, sessionIdSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';

interface RobloxUpdatesRouteProps {
  params: Promise<{ sessionId: string }>;
}

async function handleGET(request: Request, { params }: RobloxUpdatesRouteProps) {
  try {
    assertRobloxRequestAuthorized(request);
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const url = new URL(request.url);
    const query = robloxUpdateCursorSchema.parse({
      afterSequence: url.searchParams.get('afterSequence') ?? '0',
    });
    const updates = await stationService.getRobloxRuntimeUpdates(
      parsedSessionId,
      query.afterSequence,
    );
    return Response.json(updates);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export const GET = withSessionActivity('roblox', 'updates', handleGET);
