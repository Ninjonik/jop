import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { previewTimetable } from '@/lib/server/dis/timetables';
export async function POST(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, ['dispatcher_manager']);
    return previewTimetable(await request.json());
  });
}
