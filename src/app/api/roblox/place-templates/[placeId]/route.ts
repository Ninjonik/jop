import { jsonErrorResponse, parseJsonRequest } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';
import { robloxPlaceIdSchema, sessionIdSchema } from '@/lib/station/domain';
import { z } from 'zod';

export const runtime = 'nodejs';

const saveTemplateSchema = z.object({ sessionId: sessionIdSchema });

interface PlaceTemplateRouteProps {
  params: Promise<{ placeId: string }>;
}

export async function GET(_request: Request, { params }: PlaceTemplateRouteProps) {
  try {
    const { placeId } = await params;
    const parsedPlaceId = robloxPlaceIdSchema.parse(placeId);
    const template = await stationService.getPlaceTemplate(parsedPlaceId);
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
    const template = await stationService.savePlaceTemplate(parsedPlaceId, body.sessionId);
    return Response.json({ template });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
