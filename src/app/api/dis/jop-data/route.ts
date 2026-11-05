import { getJopDb, listJopStations } from '@/lib/dis/jop-bridge';
import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { stationService } from '@/lib/server/services/station-service';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    const includeClosed = new URL(request.url).searchParams.get('includeClosed') === 'true';
    const liveIds = new Set(
      (await stationService.listLiveRobloxSessions()).map((session) => session.sessionId),
    );
    const allStations = await listJopStations(includeClosed);
    const db = await getJopDb();
    const allSessions = await db
      .collection('sessions')
      .find(includeClosed ? {} : { status: 'active' })
      .sort({ createdAt: -1 })
      .toArray();
    const sessions = includeClosed
      ? allSessions
      : allSessions.filter((session) => liveIds.has(String(session._id)));
    const ids = new Set(sessions.map((session) => String(session._id)));
    const stations = allStations.filter((station) => ids.has(station.sessionId));
    return {
      stations,
      sessions: sessions.map((session) => ({
        sessionId: String(session._id),
        title: session.title || session.name || String(session._id),
        createdAt: session.createdAt || null,
        status: session.status,
        isLive: liveIds.has(String(session._id)),
        stationIds: stations
          .filter((station) => station.sessionId === String(session._id))
          .map((station) => station.stationId),
      })),
    };
  });
}
