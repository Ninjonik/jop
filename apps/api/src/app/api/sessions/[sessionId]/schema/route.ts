import { sessionIdSchema } from '@/lib/station/domain';
import { jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

interface SessionSchemaRouteProps {
  params: Promise<{
    sessionId: string;
  }>;
}

export async function GET(_request: Request, { params }: SessionSchemaRouteProps) {
  try {
    const { sessionId } = await params;
    const parsedSessionId = sessionIdSchema.parse(sessionId);
    const schema = await stationService.exportSessionSchema(parsedSessionId);
    return Response.json({ schema });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
