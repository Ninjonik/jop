import { dispatchers, requireDisProfile } from '@/lib/server/dis/appwrite';
import { listStationClaims, requireStationClaim } from '@/lib/server/dis/claims';
import {
  createEdd,
  importTimetable,
  listEdd,
  recordEddEvent,
  scopeSchema,
} from '@/lib/server/dis/edd';
import {
  diaryContacts,
  editDiary,
  listDiaryMessages,
  receiveDiaryMessage,
  sendDiaryMessage,
} from '@/lib/server/dis/edd-diary';
import { disResponse } from '@/lib/server/dis/http';
import { z } from 'zod';
export async function GET(request: Request) {
  return disResponse(async () => {
    const profile = await requireDisProfile(request, dispatchers);
    const scope = scopeSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    await requireStationClaim(scope.sessionId, scope.stationId, profile);
    const [records, messages, contacts, claims] = await Promise.all([
      listEdd(scope),
      listDiaryMessages(scope.sessionId, scope.stationId),
      diaryContacts(scope.sessionId, scope.stationId),
      listStationClaims(scope.sessionId),
    ]);
    const owner = claims.find((claim) => claim.stationId === scope.stationId);
    return {
      records,
      messages,
      contacts,
      operator: owner?.userName || null,
      canWrite: owner?.userId === profile.userId,
    };
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    const profile = await requireDisProfile(request, dispatchers);
    const body = await request.json();
    const { command } = z
      .object({ command: z.enum(['create', 'import', 'record', 'edit', 'send', 'receive']) })
      .parse(body);
    if (command === 'create') return createEdd(body, profile);
    if (command === 'import') return importTimetable(body, profile);
    if (command === 'edit') return editDiary(body, profile);
    if (command === 'send') return sendDiaryMessage(body, profile);
    if (command === 'receive') return receiveDiaryMessage(body, profile);
    return recordEddEvent(body, profile);
  });
}
