import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { loadDisPlaces } from '@/lib/server/dis/places';

export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    return loadDisPlaces();
  });
}
