import { managers, requireDisProfile } from '@/lib/server/dis/appwrite';
import { loadDisDocuments, saveDisDocument } from '@/lib/server/dis/content';
import { disResponse } from '@/lib/server/dis/http';
export async function GET(request: Request) {
  return disResponse(async () => {
    const profile = await requireDisProfile(request);
    return {
      documents: await loadDisDocuments(
        profile.role === 'admin' || managers.includes(profile.role),
      ),
    };
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    const profile = await requireDisProfile(request, managers);
    return saveDisDocument(await request.json(), profile);
  });
}
