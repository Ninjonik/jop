import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { loadTimetables, retireTimetable, saveTimetable } from '@/lib/server/dis/timetables';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    return {
      timetables: await loadTimetables(
        new URL(request.url).searchParams.get('placeId') || '',
        new URL(request.url).searchParams.get('includeInactive') === 'true',
      ),
    };
  });
}
export async function DELETE(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, ['dispatcher_manager']);
    return retireTimetable(await request.json());
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, ['dispatcher_manager']);
    return saveTimetable(await request.json());
  });
}
