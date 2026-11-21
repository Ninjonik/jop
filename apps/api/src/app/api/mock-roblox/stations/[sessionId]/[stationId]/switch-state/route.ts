import { randomUUID } from 'crypto';

import { mockInboundSwitchUpdateSchema } from '@/lib/station/domain';
import { parseJsonRequest, jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

interface MockRouteProps {
  params: Promise<{
    sessionId: string;
    stationId: string;
  }>;
}

export async function POST(request: Request, { params }: MockRouteProps) {
  try {
    const { sessionId, stationId } = await params;
    const body = await parseJsonRequest(request, mockInboundSwitchUpdateSchema);
    const station = await stationService.applyMockInboundSwitchPosition({
      commandId: randomUUID(),
      sessionId,
      stationId,
      type: 'switch:set-position',
      issuedAt: new Date().toISOString(),
      actor: {
        type: 'mock-roblox',
        id: body.actorId,
      },
      payload: {
        pieceId: body.pieceId,
        position: body.position,
      },
    });

    return Response.json({ station });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
