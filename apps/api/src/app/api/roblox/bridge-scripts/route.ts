import { jsonErrorResponse } from '@/lib/server/http';
import { assertRobloxRequestAuthorized } from '@/lib/server/roblox/roblox-auth';
import { getRobloxBridgeScripts } from '@/lib/server/roblox/bridge-scripts';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try {
    assertRobloxRequestAuthorized(request);
    const payload = await getRobloxBridgeScripts();
    return Response.json(payload);
  } catch (error) {
    return jsonErrorResponse(error);
  }
}
