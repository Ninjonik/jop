import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';
import { robloxPlaceIdSchema, robloxUniverseIdSchema, sessionIdSchema } from '@/lib/station/domain';
import { z } from 'zod';

export const runtime = 'nodejs';

const saveTemplateSchema = z.object({
  sessionId: sessionIdSchema,
  universeId: robloxUniverseIdSchema,
});

interface PlaceTemplateRouteProps {
  params: Promise<{ placeId: string }>;
}

export async function GET(request: Request, { params }: PlaceTemplateRouteProps) {
  try {
    const { placeId } = await params;
    const parsedPlaceId = robloxPlaceIdSchema.parse(placeId);
    const universeId = robloxUniverseIdSchema.parse(
      new URL(request.url).searchParams.get('universeId'),
    );
    const template = await stationService.getPlaceTemplate(universeId, parsedPlaceId);
    if (!template) {
      return Response.json(
        { error: { code: 'NOT_FOUND', message: 'Place template not found.' } },
        { status: 404 },
      );
    }
    return Response.json({ template });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: PlaceTemplateRouteProps) {
  try {
    const { placeId } = await params;
    const parsedPlaceId = robloxPlaceIdSchema.parse(placeId);
    const body = await parseJsonRequest(request, saveTemplateSchema);
    const template = await stationService.savePlaceTemplate(
      body.universeId,
      parsedPlaceId,
      body.sessionId,
    );
    return Response.json({ template });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
