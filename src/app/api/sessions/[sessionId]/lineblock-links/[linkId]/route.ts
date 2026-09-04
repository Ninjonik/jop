import { z } from 'zod';

import { sessionIdSchema, updateLineblockLinkSchema } from '@/lib/station/domain';
import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

interface LineblockLinkRouteProps {
  params: Promise<{ sessionId: string; linkId: string }>;
}

const linkIdSchema = z.string().uuid();

export async function PATCH(request: Request, { params }: LineblockLinkRouteProps) {
  try {
    const { sessionId, linkId } = await params;
    const link = await stationService.updateLineblockLinkDefaultFlow(
      sessionIdSchema.parse(sessionId),
      linkIdSchema.parse(linkId),
      (await parseJsonRequest(request, updateLineblockLinkSchema)).defaultFlow,
    );
    return Response.json({ link });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: LineblockLinkRouteProps) {
  try {
    const { sessionId, linkId } = await params;
    await stationService.removeLineblockLink(sessionIdSchema.parse(sessionId), linkIdSchema.parse(linkId));
    return new Response(null, { status: 204 });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
