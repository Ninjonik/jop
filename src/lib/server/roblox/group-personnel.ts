import type { UserProfile } from '@/lib/dis/appwrite-client';
import { createRobloxPersonnelProfile } from '@/lib/dis/roblox-profile';
import { mapRobloxRoleToDis } from '@/lib/dis/roblox-roles';
import { z } from 'zod';

const roleSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  rank: z.number().int().min(0).max(255),
});
const rolesSchema = z.object({ groupId: z.number().int().positive(), roles: z.array(roleSchema) });
const membersSchema = z.object({
  nextPageCursor: z.string().nullable().optional(),
  data: z.array(
    z.object({
      userId: z.number().int().positive(),
      username: z.string().min(1),
      displayName: z.string().optional(),
    }),
  ),
});

async function readRoblox(url: URL) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(
      `Roblox personnel lookup returned HTTP ${response.status}. No incomplete roster will be imported.`,
    );
  return response.json();
}

/** Read the complete roster before any write; role-specific lists include secondary roles. */
export async function readRobloxGroupPersonnel(
  groupId: string,
  roleName?: string,
): Promise<UserProfile[]> {
  if (!/^[1-9]\d*$/.test(groupId)) throw new Error('Configure a valid ROBLOX_GROUP_ID.');
  const listing = rolesSchema.parse(
    await readRoblox(new URL(`https://groups.roblox.com/v1/groups/${groupId}/roles`)),
  );
  if (String(listing.groupId) !== groupId) throw new Error('Roblox returned a different group.');
  const roles = listing.roles.filter(
    (role) => mapRobloxRoleToDis(role.name, role.rank) && (!roleName || role.name === roleName),
  );
  if (!roles.length) throw new Error('No group roles match the DIS role mapping.');
  const profiles = new Map<string, UserProfile>();
  for (const role of roles) {
    let cursor: string | null = null;
    const seenCursors = new Set<string>();
    do {
      const url = new URL(`https://groups.roblox.com/v1/groups/${groupId}/roles/${role.id}/users`);
      url.searchParams.set('limit', '100');
      url.searchParams.set('sortOrder', 'Asc');
      if (cursor) url.searchParams.set('cursor', cursor);
      const page = membersSchema.parse(await readRoblox(url));
      for (const user of page.data) {
        const profile = createRobloxPersonnelProfile(
          {
            id: String(user.userId),
            username: user.username,
            displayName: user.displayName || user.username,
          },
          role,
        )!;
        const current = profiles.get(profile.userId);
        if (!current || role.rank > (current.robloxRank ?? 0))
          profiles.set(profile.userId, profile);
      }
      cursor = page.nextPageCursor || null;
      if (cursor && seenCursors.has(cursor))
        throw new Error('Roblox repeated a personnel page cursor.');
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
  }
  return [...profiles.values()].sort((a, b) => a.name.localeCompare(b.name, 'sk'));
}
