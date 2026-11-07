import { z } from 'zod';

const pageSchema = z.object({
  data: z.array(z.object({ id: z.number().int().positive(), name: z.string().min(1) })),
  nextPageCursor: z.string().nullable().optional(),
});

export async function getRobloxPlaceNames(universeId: string): Promise<Map<string, string>> {
  if (!/^[1-9]\d*$/.test(universeId)) throw new Error('Invalid Roblox universe ID.');
  const names = new Map<string, string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const url = new URL(`https://develop.roblox.com/v1/universes/${universeId}/places`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
    if (!response.ok) throw new Error(`Roblox names returned HTTP ${response.status}.`);
    const page = pageSchema.parse(await response.json());
    for (const place of page.data) names.set(String(place.id), place.name);
    cursor = page.nextPageCursor || null;
    if (cursor && seenCursors.has(cursor)) throw new Error('Repeated Roblox pagination cursor.');
    if (cursor) seenCursors.add(cursor);
  } while (cursor);
  return names;
}
