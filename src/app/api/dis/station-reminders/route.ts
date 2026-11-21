import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { changeReminder, loadReminders } from '@/lib/server/dis/station-reminders';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    return loadReminders(Object.fromEntries(new URL(request.url).searchParams));
  });
}
export async function POST(request: Request) {
  return disResponse(async () =>
    changeReminder(await request.json(), await requireDisProfile(request)),
  );
}
