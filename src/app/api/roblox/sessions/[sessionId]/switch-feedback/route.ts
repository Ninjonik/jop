import { jsonErrorResponse } from '@/lib/server/http';
import { assertRobloxRequestAuthorized } from '@/lib/server/roblox/roblox-auth';
import { queueRobloxSessionMutation } from '@/lib/server/roblox/session-mutation-queue';
import { stationService } from '@/lib/server/services/station-service';
import {
  robloxSwitchFeedbackBatchSchema,
  robloxSwitchFeedbackSchema,
  sessionIdSchema,
} from '@/lib/station/domain';

export const runtime = 'nodejs';

interface SwitchFeedbackRouteProps {
  params: Promise<{ sessionId: string }>;
}

export async function POST(request: Request, { params }: SwitchFeedbackRouteProps) {
  try {
    assertRobloxRequestAuthorized(request);
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const rawBody = await request.json();

    return await queueRobloxSessionMutation(parsedSessionId, async () => {
      const batchParse = robloxSwitchFeedbackBatchSchema.safeParse(rawBody);
      if (batchParse.success) {
        const results = [];
        for (const event of batchParse.data.events) {
          results.push(await stationService.applyRobloxSwitchFeedback(parsedSessionId, event));
        }
        return Response.json({ applied: results.some((result) => result.applied) });
      }

      const body = robloxSwitchFeedbackSchema.parse(rawBody);
      const result = await stationService.applyRobloxSwitchFeedback(parsedSessionId, body);
      return Response.json({ applied: result.applied });
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
