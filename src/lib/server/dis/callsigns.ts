import type { UserProfile } from '@/lib/dis/appwrite-client';
import { callsignNumber } from '@/lib/dis/callsign';
import type { Models } from 'node-appwrite';
import { personnelCallsignRepository } from '../repositories/personnel-callsign-repository';
import { databaseId, disDatabase, DisError, listDocuments } from './appwrite';

async function allocateNumber(userId: string) {
  const existing = await personnelCallsignRepository.findByUser(userId);
  if (existing) return existing;
  const used = new Set(await personnelCallsignRepository.listNumbers());
  for (let number = 1; number <= 999; number++) {
    const candidate = String(number).padStart(3, '0');
    if (used.has(candidate)) continue;
    const reserved = await personnelCallsignRepository.reserve(userId, candidate);
    if (reserved) return reserved;
  }
  throw new DisError(409, 'Všetkých 999 volacích znakov je pridelených. Kontaktujte správcu.');
}
/** Preserve valid existing numbers before assigning replacements to collisions. */
export async function ensurePersonnelCallsigns() {
  const profiles = await listDocuments<Models.Document & UserProfile>('profiles');
  const ordered = [...profiles].sort((a, b) => a.userId.localeCompare(b.userId));
  for (const profile of ordered) {
    const preferred = callsignNumber(profile.callsign);
    if (preferred) await personnelCallsignRepository.reserve(profile.userId, preferred);
  }
  for (const profile of ordered) {
    const callsign = `ZSSK-${await allocateNumber(profile.userId)}`;
    if (profile.callsign !== callsign) {
      await disDatabase().updateDocument(databaseId, 'profiles', profile.$id, { callsign });
      profile.callsign = callsign;
    }
  }
  return profiles;
}
export async function allocatePersonnelCallsign(userId: string) {
  // Seed all legacy profiles first so a new member cannot steal an existing code.
  await ensurePersonnelCallsigns();
  return `ZSSK-${await allocateNumber(userId)}`;
}
