import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
export async function GET(request: Request) {
  return disResponse(async () => ({ profile: await requireDisProfile(request) }));
}
