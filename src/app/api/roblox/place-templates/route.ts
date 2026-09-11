import { jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return Response.json({ templates: await stationService.listPlaceTemplates() });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
