import type { UserProfile } from './appwrite-client';
import { mapRobloxRoleToDis } from './roblox-roles';

/** Shared first-login and personnel-import defaults. Existing assessments are not rebuilt. */
export function createRobloxPersonnelProfile(
  user: { id: string; username: string; displayName: string },
  groupRole: { name: string; rank: number },
): UserProfile | null {
  const assignment = mapRobloxRoleToDis(groupRole.name, groupRole.rank);
  if (!assignment) return null;
  return {
    userId: `rbx_${user.id}`,
    name: user.displayName,
    callsign: `ZSSK-${user.id.slice(-3)}`,
    role: assignment.role,
    trainingStage: assignment.trainingStage,
    strikes: 0,
    robloxUserId: user.id,
    robloxUsername: user.username,
    robloxRoleName: groupRole.name,
    robloxRank: groupRole.rank,
  };
}
