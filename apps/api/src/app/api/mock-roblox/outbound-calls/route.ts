import { getOutboundRobloxCalls } from '@/lib/server/roblox/mock-roblox-port';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId') ?? undefined;

  return Response.json({
    calls: getOutboundRobloxCalls(sessionId),
  });
}
