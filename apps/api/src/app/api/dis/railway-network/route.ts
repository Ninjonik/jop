import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { loadRailwayNetwork, saveRailwayNetwork } from '@/lib/server/dis/railway-network';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    return loadRailwayNetwork(new URL(request.url).searchParams.get('placeId'));
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, ['dispatcher_manager']);
    return saveRailwayNetwork(await request.json());
  });
}
