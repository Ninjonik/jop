import { managers, requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { assessStaff, loadStaff } from '@/lib/server/dis/personnel';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, managers);
    return loadStaff();
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, managers);
    return assessStaff(await request.json());
  });
}
