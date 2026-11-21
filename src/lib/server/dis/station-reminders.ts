import type { UserProfile } from '@/lib/dis/appwrite-client';
import { stationClaimSchema } from '@/lib/dis/claims';
import { reminderCommandSchema, type StationReminder } from '@/lib/dis/station-reminders';
import { getMongoDb } from '../mongo';
import { stationRepository } from '../repositories/station-repository';
import { DisError } from './appwrite';
import { requireLiveSession, requireStationClaim } from './claims';
type ReminderDocument = StationReminder & { _id: string; sessionId: string; stationId: string };
async function collection() {
  return (await getMongoDb()).collection<ReminderDocument>('station_reminders');
}
export async function loadReminders(body: unknown) {
  const scope = stationClaimSchema.parse(body);
  await requireLiveSession(scope.sessionId);
  return { reminders: await (await collection()).find(scope).toArray() };
}
export async function changeReminder(body: unknown, profile: UserProfile) {
  const input = reminderCommandSchema.parse(body);
  await requireStationClaim(input.sessionId, input.stationId, profile);
  const scope = { sessionId: input.sessionId, stationId: input.stationId };
  if (input.action === 'delete') await (await collection()).deleteOne({ ...scope, id: input.id });
  else {
    const station = await stationRepository.findBySessionAndStationId(
      input.sessionId,
      input.stationId,
    );
    if (
      !station ||
      input.reminder.x >= station.layout.width ||
      input.reminder.y >= station.layout.height
    )
      throw new DisError(400, 'Pripomienka musí zostať na staničnom pulte.');
    const _id = JSON.stringify([input.sessionId, input.stationId, input.reminder.id]);
    await (
      await collection()
    ).replaceOne({ _id }, { ...scope, ...input.reminder }, { upsert: true });
  }
  return loadReminders(scope);
}
