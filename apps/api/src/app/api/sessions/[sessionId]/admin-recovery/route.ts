import { DisError, requireDisProfile } from '@/lib/server/dis/appwrite';
import { jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';
import { adminRecoveryActionSchema, sessionIdSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    await requireDisProfile(request, ['admin']);
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const body = adminRecoveryActionSchema.parse(await request.json());
    return Response.json(
      await stationService.runAdminRecovery(parsedSessionId, body.action, body.stationId),
    );
  } catch (error) {
    if (error instanceof DisError)
      return Response.json({ error: { message: error.message } }, { status: error.status });
    return jsonErrorResponse(error);
  }
}
