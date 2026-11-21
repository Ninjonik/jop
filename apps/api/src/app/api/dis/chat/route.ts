import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { loadChat, sendChat } from '@/lib/server/dis/chat';
import { disResponse } from '@/lib/server/dis/http';

export async function GET(request: Request) {
  return disResponse(async () => {
    const profile = await requireDisProfile(request);
    const query = new URL(request.url).searchParams;
    return loadChat(
      {
        sessionId: query.get('sessionId'),
        endpoint: { kind: query.get('kind'), id: query.get('id') },
      },
      profile,
    );
  });
}
export async function POST(request: Request) {
  return disResponse(async () => sendChat(await request.json(), await requireDisProfile(request)));
}
