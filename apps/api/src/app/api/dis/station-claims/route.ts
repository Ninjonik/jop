import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { claimStation, listStationClaims, releaseStation } from '@/lib/server/dis/claims';
import { disResponse } from '@/lib/server/dis/http';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    return {
      claims: await listStationClaims(new URL(request.url).searchParams.get('sessionId') || ''),
    };
  });
}
export async function POST(request: Request) {
  return disResponse(async () =>
    claimStation(await request.json(), await requireDisProfile(request)),
  );
}
export async function DELETE(request: Request) {
  return disResponse(async () =>
    releaseStation(await request.json(), await requireDisProfile(request)),
  );
}
