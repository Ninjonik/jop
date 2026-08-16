import { sessionIdSchema } from '@/lib/station/domain';
import { jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

interface SessionRouteProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function GET(_request: Request, { params }: SessionRouteProps) {
  try {
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const session = await stationService.getSession(parsedSessionId);

    if (!session) {
      return Response.json(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Session not found.',
          },
        },
        { status: 404 }
      );
    }

    return Response.json({ session });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
