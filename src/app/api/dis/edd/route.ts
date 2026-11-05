import { dispatchers, requireDisProfile } from '@/lib/server/dis/appwrite';
import {
  createEdd,
  importTimetable,
  listEdd,
  recordEddEvent,
  scopeSchema,
} from '@/lib/server/dis/edd';
import { disResponse } from '@/lib/server/dis/http';
import { z } from 'zod';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    const scope = scopeSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return { records: await listEdd(scope) };
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    const profile = await requireDisProfile(request, dispatchers);
    const body = await request.json();
    const { command } = z.object({ command: z.enum(['create', 'import', 'record']) }).parse(body);
    if (command === 'create') return createEdd(body, profile);
    if (command === 'import') return importTimetable(body, profile);
    return recordEddEvent(body, profile);
  });
}
