import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import {
  deleteSessionTimetable,
  loadOperatingTimetables,
  saveSessionTimetable,
} from '@/lib/server/dis/session-timetables';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    return {
      timetables: await loadOperatingTimetables(
        new URL(request.url).searchParams.get('sessionId') || '',
        new URL(request.url).searchParams.get('includeInactive') === 'true',
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

export async function DELETE(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, ['dispatcher_manager']);
    return deleteSessionTimetable(await request.json());
  });
}
