import { requireDisProfile } from '@/lib/server/dis/appwrite';
import {
  deleteStockProfile,
  loadStockProfiles,
  saveStockProfile,
} from '@/lib/server/dis/gvd-profiles';
import { disResponse } from '@/lib/server/dis/http';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    return {
      profiles: await loadStockProfiles(new URL(request.url).searchParams.get('placeId') || ''),
    };
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, ['dispatcher_manager']);
    return saveStockProfile(await request.json());
  });
}
export async function DELETE(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, ['dispatcher_manager']);
    return deleteStockProfile(await request.json());
  });
}
