import { DisError, requireDisProfile } from '@/lib/server/dis/appwrite';
import { disResponse } from '@/lib/server/dis/http';
import { getMongoDb } from '@/lib/server/mongo';
import { z } from 'zod';
const namespace = z.string().min(1).max(200);
export async function GET(request: Request) {
  return disResponse(async () => {
    const profile = await requireDisProfile(request);
    const key = namespace.parse(new URL(request.url).searchParams.get('key'));
    const stored = await (
      await getMongoDb()
    )
      .collection<{_id:string;value:Record<string,unknown>}>('dis_preferences')
      .findOne({ _id: JSON.stringify([profile.userId, key]) });
    return { value: stored?.value ?? null };
  });
}
export async function POST(request: Request) {
  return disResponse(async () => {
    const profile = await requireDisProfile(request);
    const raw = await request.text();
    if (raw.length > 16000) throw new DisError(400, 'Nastavenia sú príliš veľké.');
    const input = z
      .object({
        key: namespace,
        value: z.record(
          z.string().max(100),
          z.union([
            z.string().max(8000),
            z.number().finite(),
            z.boolean(),
            z.array(z.string().max(128)).max(200),
          ]),
        ),
      })
      .parse(JSON.parse(raw));
    await (
      await getMongoDb()
    )
      .collection<{ _id: string; value: typeof input.value }>('dis_preferences')
      .updateOne(
        { _id: JSON.stringify([profile.userId, input.key]) },
        { $set: { value: input.value } },
        { upsert: true },
      );
    return { value: input.value };
  });
}
