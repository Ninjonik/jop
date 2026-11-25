import { managers, requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { getSessionClock, setSessionClock } from '@/lib/server/dis/session-clock';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    return getSessionClock(new URL(request.url).searchParams.get('sessionId'));
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, managers);
    return setSessionClock(await request.json());
  });
}
