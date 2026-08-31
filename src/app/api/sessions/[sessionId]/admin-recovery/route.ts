import { adminRecoveryActionSchema, sessionIdSchema } from '@/lib/station/domain';
import { jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const body = adminRecoveryActionSchema.parse(await request.json());
    return Response.json(
      await stationService.runAdminRecovery(parsedSessionId, body.action, body.stationId),
    );
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
