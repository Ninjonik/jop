import { requireDisProfile } from '@/lib/server/dis/appwrite';
import { loadRadio, sendRadio } from '@/lib/server/dis/content';
import { disResponse } from '@/lib/server/dis/http';
import { z } from 'zod';
export async function GET(request: Request) {
  return disResponse(async () => {
    await requireDisProfile(request);
    const sessionId = z
      .string()
      .trim()
      .min(1)
      .max(64)
      .parse(new URL(request.url).searchParams.get('sessionId'));
    return { messages: await loadRadio(sessionId) };
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    const profile = await requireDisProfile(request);
    return sendRadio(await request.json(), profile);
  });
}
