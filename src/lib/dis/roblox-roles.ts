import type { UserRole } from '@/lib/dis/appwrite-client';
import { z } from 'zod';

type DisRoleAssignment = {
  role: UserRole;
  trainingStage: 'cadet' | 'theory' | 'simulator' | 'exam' | 'certified';
};

// Both the role name and rank must match: an unrelated or newly-created group role
// must not inherit operational or administrator rights from a numerical range.
const groupRoles: Record<string, { rank: number; assignment: DisRoleAssignment }> = {
  'other staff': {
    rank: 2,
    assignment: {
      role: 'other_staff',
      trainingStage: 'certified',
    },
  },
  shunter: {
    rank: 3,
    assignment: {
      role: 'shuntman',
      trainingStage: 'certified',
    },
  },
  railworker: {
    rank: 4,
    assignment: {
      role: 'other_staff',
      trainingStage: 'certified',
    },
  },
  driver: {
    rank: 5,
    assignment: {
      role: 'driver',
      trainingStage: 'certified',
    },
  },
  'trainee driver': {
    rank: 6,
    assignment: {
      role: 'driver_trainee',
      trainingStage: 'simulator',
    },
  },
  dispatcher: {
    rank: 7,
    assignment: {
      role: 'dispatcher',
      trainingStage: 'certified',
    },
  },
  'trainee dispatcher': {
    rank: 8,
    assignment: {
      role: 'dispatcher_trainee',
      trainingStage: 'simulator',
    },
  },
  'driver trainer': {
    rank: 20,
    assignment: {
      role: 'driver_instructor',
      trainingStage: 'certified',
    },
  },
  'dispatcher trainer': {
    rank: 21,
    assignment: {
      role: 'dispatcher_instructor',
      trainingStage: 'certified',
    },
  },
  'head of infrastructure': {
    rank: 30,
    assignment: {
      role: 'admin',
      trainingStage: 'certified',
    },
  },
  'head of conductors': {
    rank: 31,
    assignment: {
      role: 'conductor_manager',
      trainingStage: 'certified',
    },
  },
  'head of drivers': {
    rank: 32,
    assignment: {
      role: 'driver_manager',
      trainingStage: 'certified',
    },
  },
  'head of signallers': {
    rank: 33,
    assignment: {
      role: 'dispatcher_manager',
      trainingStage: 'certified',
    },
  },
  contributor: {
    rank: 40,
    assignment: {
      role: 'admin',
      trainingStage: 'certified',
    },
  },
  'relations manager': {
    rank: 51,
    assignment: {
      role: 'relations_manager',
      trainingStage: 'certified',
    },
  },
  'operations dispatcher': {
    rank: 52,
    assignment: {
      role: 'operations_dispatcher',
      trainingStage: 'certified',
    },
  },
  'rolling stock manager': {
    rank: 53,
    assignment: {
      role: 'vehicle_manager',
      trainingStage: 'certified',
    },
  },
  conductor: {
    rank: 250,
    assignment: {
      role: 'conductor',
      trainingStage: 'certified',
    },
  },
  'trainee conductor': {
    rank: 251,
    assignment: {
      role: 'conductor',
      trainingStage: 'simulator',
    },
  },
  'conductor trainer': {
    rank: 252,
    assignment: {
      role: 'conductor',
      trainingStage: 'certified',
    },
  },
  'workforce director': {
    rank: 253,
    assignment: {
      role: 'workforce_director',
      trainingStage: 'certified',
    },
  },
  'board of executives': {
    rank: 254,
    assignment: {
      role: 'admin',
      trainingStage: 'certified',
    },
  },
  'executive director': {
    rank: 255,
    assignment: {
      role: 'admin',
      trainingStage: 'certified',
    },
  },
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

/** Resolve all assigned roles when the legacy single-role response cannot authorize access. */
export async function getRobloxUserGroupRole(
  userId: number | string,
  groupId?: string,
  accessToken?: string,
): Promise<{ roleName: string; rank: number } | null> {
  const targetGroup = groupId || process.env.ROBLOX_GROUP_ID;
  if (!targetGroup || !/^[1-9]\d*$/.test(targetGroup) || !/^[1-9]\d*$/.test(String(userId)))
    throw new RobloxGroupLookupError('Roblox group/user ID is not configured correctly.');
  let publicRole: { roleName: string; rank: number } | null = null;
  try {
    const response = await fetch(`https://groups.roblox.com/v2/users/${userId}/groups/roles`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      const result = publicGroupsSchema.parse(await response.json());
      const membership = result.data.find((item) => String(item.group.id) === targetGroup);
      if (!membership || membership.role.rank <= 0) return null;
      publicRole = { roleName: membership.role.name, rank: membership.role.rank };
      if (!accessToken && mapRobloxRoleToDis(publicRole.roleName, publicRole.rank))
        return publicRole;
    }
  } catch {
    /* Try the configured Open Cloud credential after an unavailable public lookup. */
  }

  const apiKey = process.env.ROBLOX_API_KEY;
  if (!accessToken && !apiKey && publicRole) return publicRole;
  if (!accessToken && !apiKey)
    throw new RobloxGroupLookupError(
      'Roblox group lookup is unavailable. Configure ROBLOX_API_KEY for the Open Cloud fallback.',
    );
  try {
    const url = new URL(`https://apis.roblox.com/cloud/v2/groups/${targetGroup}/memberships`);
    url.searchParams.set('filter', `user == 'users/${userId}'`);
    url.searchParams.set('maxPageSize', '100');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    else if (apiKey) headers['x-api-key'] = apiKey;
    const response = await fetch(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw await groupApiError(response, 'Membership lookup', accessToken || apiKey || '');
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
    let authorized: z.infer<typeof roleSchema> | undefined;
    for (const path of paths) {
      if (!new RegExp(`^groups/${targetGroup}/roles/[1-9]\\d*$`).test(path))
        throw new Error('Unexpected group role resource path.');
      const roleResponse = await fetch(`https://apis.roblox.com/cloud/v2/${path}`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!roleResponse.ok)
        throw await groupApiError(roleResponse, 'Role lookup', accessToken || apiKey || '');
      const role = roleSchema.parse(await roleResponse.json());
      if (!highest || role.rank > highest.rank) highest = role;
      if (
        mapRobloxRoleToDis(role.displayName, role.rank) &&
        (!authorized || role.rank > authorized.rank)
      )
        authorized = role;
    }
    highest = authorized || highest;
    return highest && highest.rank > 0
      ? { roleName: highest.displayName, rank: highest.rank }
      : null;
  } catch (error) {
    if (error instanceof RobloxGroupLookupError) throw error;
    throw new RobloxGroupLookupError('Roblox Open Cloud group lookup failed.', { cause: error });
  }
}

async function groupApiError(response: Response, operation: string, apiKey: string) {
  const payload: unknown = await response.json().catch(() => null);
  const failure = z
    .object({ code: z.string().optional(), message: z.string().optional() })
    .safeParse(payload);
  const detail = failure.success
    ? [failure.data.code, failure.data.message]
        .filter(Boolean)
        .join(': ')
        .split(apiKey)
        .join('[redacted]')
        .slice(0, 500)
    : 'No structured API error returned.';
  return new RobloxGroupLookupError(`${operation} returned HTTP ${response.status}: ${detail}`);
}
