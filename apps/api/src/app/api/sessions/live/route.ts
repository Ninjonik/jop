import { jsonErrorResponse } from '@/lib/server/http';
import { isDisAdministrator } from '@/lib/dis/permissions';
import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { stationService } from '@/lib/server/services/station-service';
import { isPublicStation } from '@/lib/station/visibility';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    const profile = await requireDisProfile(request);
    const includeInternal = isDisAdministrator(profile.role);
    const sessions = await stationService.listLiveRobloxSessions();
    return Response.json({
      sessions: sessions.map((session) => ({
        ...session,
        stations: session.stations.filter(
          (station) => includeInternal || isPublicStation(station.stationId),
        ),
      })),
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
