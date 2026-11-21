import { stationService } from '@/lib/server/services/station-service';
import { jsonErrorResponse } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const session = await stationService.createMockSession();
    return Response.json({ session });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
