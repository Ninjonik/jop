import { createLineblockLinkSchema, sessionIdSchema } from '@/lib/station/domain';
import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

interface SessionLineblockLinksRouteProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function POST(request: Request, { params }: SessionLineblockLinksRouteProps) {
  try {
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const body = await parseJsonRequest(request, createLineblockLinkSchema);

    if (body.sessionId !== parsedSessionId) {
      return Response.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Session ID mismatch.',
          },
        },
        { status: 400 }
      );
    }

    const link = await stationService.createLineblockLink(parsedSessionId, {
      a: body.a,
      b: body.b,
    });

    return Response.json({ link }, { status: 201 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
