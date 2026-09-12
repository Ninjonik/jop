import { z } from 'zod';

import type { StationDocument } from '@/lib/station/domain';
import { deserializeStationLayout, robloxPlaceIdSchema, robloxUniverseIdSchema, stationIdSchema, stationLayoutSchema } from '@/lib/station/domain';
import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

const replaceTemplateStationLayoutSchema = z.object({
  universeId: robloxUniverseIdSchema,
  layout: stationLayoutSchema,
});

interface TemplateStationRouteProps {
  params: Promise<{ placeId: string; stationId: string }>;
}

export async function PUT(request: Request, { params }: TemplateStationRouteProps) {
  try {
    const { placeId, stationId } = await params;
    const body = await parseJsonRequest(request, replaceTemplateStationLayoutSchema);
    const template = await stationService.replacePlaceTemplateStationLayout(
      body.universeId,
      robloxPlaceIdSchema.parse(placeId),
      stationIdSchema.parse(stationId),
      deserializeStationLayout(body.layout as StationDocument['layout']),
    );
    return Response.json({ template });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
