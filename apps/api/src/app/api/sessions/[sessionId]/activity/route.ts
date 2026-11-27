import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { jsonErrorResponse } from '@/lib/server/http';
import { sessionActivityRepository } from '@/lib/server/repositories/session-activity-repository';
import { sessionIdSchema } from '@/lib/station/domain';
import { z } from 'zod';

export const runtime = 'nodejs';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    await requireDisProfile(request, ['admin']);
    const sessionId = sessionIdSchema.parse((await params).sessionId);
    const raw = new URL(request.url).searchParams.get('cursor');
    const cursor = raw
      ? z
          .string()
          .regex(/^[a-f0-9]{24}$/)
          .parse(raw)
      : undefined;
    return Response.json(await sessionActivityRepository.list(sessionId, cursor), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
