import { AppwriteException, type Models } from 'node-appwrite';
import type { UserProfile } from '../src/lib/dis/appwrite-client';
import { databaseId, disDatabase, listDocuments } from '../src/lib/server/dis/appwrite';
import { readRobloxGroupPersonnel } from '../src/lib/server/roblox/group-personnel';

async function main() {
  const roster = await readRobloxGroupPersonnel(process.env.ROBLOX_GROUP_ID || '', 'Contributor');
  const existing = await listDocuments<Models.Document & UserProfile>('profiles');
  const profiles = new Map(existing.map((profile) => [profile.$id, profile]));
  const apply = process.argv.includes('--apply');
  const db = disDatabase();
  let created = 0,
    promoted = 0,
    alreadyAdmin = 0,
    missing = 0,
    needsPromotion = 0;
  for (const person of roster) {
    const current = profiles.get(person.userId);
    if (current?.role === 'admin') {
      alreadyAdmin++;
      continue;
    }
    if (current) needsPromotion++;
    else missing++;
    if (!apply) continue;
    if (!current) {
      try {
        await db.createDocument(databaseId, 'profiles', person.userId, person);
        created++;
        continue;
      } catch (error) {
        if (!(error instanceof AppwriteException) || error.code !== 409) throw error;
      }
    }
    // Only identity/role fields change. Preserve training assessments, strikes and notes.
    await db.updateDocument(databaseId, 'profiles', person.userId, {
      role: 'admin',
      robloxRoleName: person.robloxRoleName,
      robloxRank: person.robloxRank,
    });
    promoted++;
  }
  if (apply) {
    const persisted = new Map(
      (await listDocuments<Models.Document & UserProfile>('profiles')).map((profile) => [
        profile.$id,
        profile,
      ]),
    );
    if (roster.some((person) => persisted.get(person.userId)?.role !== 'admin'))
      throw new Error('Contributor admin verification failed.');
    for (const person of roster) {
      const before = profiles.get(person.userId),
        after = persisted.get(person.userId)!;
      if (
        before &&
        (['trainingStage', 'strikes', 'notes'] as const).some(
          (field) => before[field] !== after[field],
        )
      )
        throw new Error('An existing assessment changed unexpectedly.');
    }
  }
  console.log(
    JSON.stringify(
      {
        applied: apply,
        contributors: roster.length,
        alreadyAdmin,
        missing,
        needsPromotion,
        created,
        promoted,
        verified: apply,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
