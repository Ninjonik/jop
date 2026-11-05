import type { UserRole } from '@/lib/dis/appwrite-client';
import { z } from 'zod';

type DisRoleAssignment = {
  role: UserRole;
  trainingStage: 'cadet' | 'theory' | 'simulator' | 'exam' | 'certified';
};

// Both the role name and rank must match: an unrelated or newly-created group role
// must not inherit operational or administrator rights from a numerical range.
const groupRoles: Record<string, { rank: number; assignment: DisRoleAssignment }> = {
  driver: { rank: 2, assignment: { role: 'driver', trainingStage: 'certified' } },
  dispatcher: { rank: 4, assignment: { role: 'dispatcher', trainingStage: 'certified' } },
  'trainee driver': { rank: 8, assignment: { role: 'driver_trainee', trainingStage: 'simulator' } },
  'trainee dispatcher': {
    rank: 9,
    assignment: { role: 'dispatcher_trainee', trainingStage: 'simulator' },
  },
  'driver trainer': {
    rank: 28,
    assignment: { role: 'driver_instructor', trainingStage: 'certified' },
  },
  'dispatcher trainer': {
    rank: 30,
    assignment: { role: 'dispatcher_instructor', trainingStage: 'certified' },
  },
  'head of drivers': {
    rank: 201,
    assignment: { role: 'driver_manager', trainingStage: 'certified' },
  },
  'head of dispatchers': {
    rank: 203,
    assignment: { role: 'dispatcher_manager', trainingStage: 'certified' },
  },
  'board of executives': { rank: 254, assignment: { role: 'admin', trainingStage: 'certified' } },
  'executive director': { rank: 255, assignment: { role: 'admin', trainingStage: 'certified' } },
};

export function mapRobloxRoleToDis(roleName: string, rank: number): DisRoleAssignment | null {
  const entry = groupRoles[roleName.trim().toLowerCase()];
  return entry?.rank === rank ? entry.assignment : null;
}

export class RobloxGroupLookupError extends Error {}

const roleSchema = z.object({
  displayName: z.string().min(1).max(128),
  rank: z.number().int().min(0).max(255),
});
const publicGroupsSchema = z.object({
  data: z.array(
    z.object({
      group: z.object({ id: z.number().int().positive() }),
      role: z.object({ name: z.string().min(1).max(128), rank: z.number().int().min(0).max(255) }),
    }),
  ),
});
const membershipsSchema = z.object({
  groupMemberships: z.array(
    z.object({
      user: z.string(),
      role: z.string().optional(),
      roles: z.array(z.string()).optional(),
    }),
  ),
});

/** Public lookup first; Open Cloud resolves the highest assigned role to its actual name/rank. */
export async function getRobloxUserGroupRole(
  userId: number | string,
  groupId?: string,
): Promise<{ roleName: string; rank: number } | null> {
  const targetGroup = groupId || process.env.ROBLOX_GROUP_ID;
  if (!targetGroup || !/^[1-9]\d*$/.test(targetGroup) || !/^[1-9]\d*$/.test(String(userId)))
    throw new RobloxGroupLookupError('Roblox group/user ID is not configured correctly.');
  try {
    const response = await fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const result = publicGroupsSchema.parse(await response.json());
      const membership = result.data.find((item) => String(item.group.id) === targetGroup);
      return membership && membership.role.rank > 0
        ? { roleName: membership.role.name, rank: membership.role.rank }
        : null;
    }
  } catch {
    /* Try the configured Open Cloud credential after an unavailable public lookup. */
  }

  const apiKey = process.env.ROBLOX_API_KEY;
  if (!apiKey)
    throw new RobloxGroupLookupError(
      'Roblox group lookup is unavailable. Configure ROBLOX_API_KEY for the Open Cloud fallback.',
    );
  try {
    const url = new URL(`https://apis.roblox.com/cloud/v2/groups/${targetGroup}/memberships`);
    url.searchParams.set('filter', `user == 'users/${userId}'`);
    url.searchParams.set('maxPageSize', '100');
    const headers = { Accept: 'application/json', 'x-api-key': apiKey };
    const response = await fetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Membership lookup returned HTTP ${response.status}.`);
    const memberships = membershipsSchema
      .parse(await response.json())
      .groupMemberships.filter((membership) => membership.user === `users/${userId}`);
    if (memberships.length === 0) return null;
    const paths = [
      ...new Set(
        memberships.flatMap((membership) =>
          membership.roles?.length ? membership.roles : membership.role ? [membership.role] : [],
        ),
      ),
    ];
    if (paths.length === 0) return null;
    let highest: z.infer<typeof roleSchema> | undefined;
    for (const path of paths) {
      if (!new RegExp(`^groups/${targetGroup}/roles/[1-9]\\d*$`).test(path))
        throw new Error('Unexpected group role resource path.');
      const roleResponse = await fetch(`https://apis.roblox.com/cloud/v2/${path}`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!roleResponse.ok) throw new Error(`Role lookup returned HTTP ${roleResponse.status}.`);
      const role = roleSchema.parse(await roleResponse.json());
      if (!highest || role.rank > highest.rank) highest = role;
    }
    return highest && highest.rank > 0
      ? { roleName: highest.displayName, rank: highest.rank }
      : null;
  } catch {
    throw new RobloxGroupLookupError(
      'Roblox Open Cloud group lookup failed. Check group membership/role read permissions.',
    );
  }
}
