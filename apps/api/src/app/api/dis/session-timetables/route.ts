import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { loadOperatingTimetables, saveSessionTimetable } from '@/lib/server/dis/session-timetables';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    return {
      timetables: await loadOperatingTimetables(
        new URL(request.url).searchParams.get('sessionId') || '',
      ),
    };
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, ['dispatcher_manager']);
    return saveSessionTimetable(await request.json());
  });
}
