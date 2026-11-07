import { AppwriteException } from 'node-appwrite';
import { readRobloxGroupPersonnel } from '../roblox/group-personnel';
import { databaseId, disDatabase, listDocuments } from './appwrite';

export async function importRobloxPersonnel(groupId: string, apply: boolean) {
  const roster = await readRobloxGroupPersonnel(groupId);
  const existing = await listDocuments('profiles');
  const existingIds = new Set(existing.map((profile) => profile.$id));
  const missing = roster.filter((profile) => !existingIds.has(profile.userId));
  let created = 0,
    alreadyPresent = roster.length - missing.length;
  if (apply) {
    const db = disDatabase();
    for (const profile of missing) {
      try {
        await db.createDocument(databaseId, 'profiles', profile.userId, profile);
        created++;
      } catch (error) {
        if (!(error instanceof AppwriteException) || error.code !== 409) throw error;
        // A first login or another import may have created the profile meanwhile.
        alreadyPresent++;
      }
    }
  }
  return {
    eligible: roster.length,
    alreadyPresent,
    missing: missing.length,
    created,
    applied: apply,
    roles: roster.reduce<Record<string, number>>((counts, profile) => {
      counts[profile.role] = (counts[profile.role] || 0) + 1;
      return counts;
    }, {}),
  };
}
