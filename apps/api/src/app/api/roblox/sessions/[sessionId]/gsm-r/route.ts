import { withSessionActivity } from '@/lib/server/session-activity-http';
import { DisError } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { commandGsmR, loadGsmR } from '@/lib/server/roblox/gsm-r-service';
import { assertRobloxRequestAuthorized } from '@/lib/server/roblox/roblox-auth';
import { sessionIdSchema } from '@/lib/station/domain';

export const runtime = 'nodejs';
type Context = { params: Promise<{ sessionId: string }> };
async function authorize(request: Request, context: Context) {
  try {
    assertRobloxRequestAuthorized(request);
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized Roblox request.')
      throw new DisError(401, 'Neoprávnená požiadavka Roblox.');
    throw error;
  }
  return sessionIdSchema.parse((await context.params).sessionId);
}
export async function GET(request: Request, context: Context) {
  return disResponse(async () => loadGsmR(await authorize(request, context)));
}
async function handlePOST(request: Request, context: Context) {
  return disResponse(async () => {
    const sessionId = await authorize(request, context);
    return commandGsmR(sessionId, await request.json());
  });
}

export const POST = withSessionActivity('roblox', 'gsm-r', handlePOST);
