import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { deleteLine, loadLines, saveLine } from '@/lib/server/dis/lines';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    return { lines: await loadLines(new URL(request.url).searchParams.get('placeId') || '') };
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, ['dispatcher_manager']);
    return saveLine(await request.json());
  });
}
export async function DELETE(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request, ['dispatcher_manager']);
    return deleteLine(await request.json());
  });
}
