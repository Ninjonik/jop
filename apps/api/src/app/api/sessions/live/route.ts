import { jsonErrorResponse } from '@/lib/server/http';
import { stationService } from '@/lib/server/services/station-service';
import { isPublicStation } from '@/lib/station/visibility';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const sessions = await stationService.listLiveRobloxSessions();
    return Response.json({
      sessions: sessions.map((session) => ({
        ...session,
        stations: session.stations.filter((station) => isPublicStation(station.stationId)),
      })),
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
