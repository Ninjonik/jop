import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { loadTimetables, saveTimetable } from '@/lib/server/dis/timetables';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    return {
      timetables: await loadTimetables(new URL(request.url).searchParams.get('placeId') || ''),
    };
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, ['dispatcher_manager']);
    return saveTimetable(await request.json());
  });
}
