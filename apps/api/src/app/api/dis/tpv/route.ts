import type { EddRecord } from '@/lib/dis/records';
import { listDocuments, requireDisProfile } from '@/lib/server/dis/appwrite';
import { requireLiveSession } from '@/lib/server/dis/claims';
import { disResponse } from '@/lib/server/dis/http';
import { Query, type Models } from 'node-appwrite';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    const sessionId = new URL(request.url).searchParams.get('sessionId') || '';
    await requireLiveSession(sessionId);
    return {
      records: await listDocuments<Models.Document & EddRecord>('edd_records', [
        Query.equal('sessionId', sessionId),
      ]),
    };
  });
}
