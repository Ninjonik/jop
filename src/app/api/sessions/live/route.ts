import { jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const sessions = await stationService.listLiveRobloxSessions();
    return Response.json({ sessions });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
