import { z } from 'zod';
import { stationClaimSchema } from './claims';
export const reminderSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['maintenance', 'note', 'cover']),
  x: z.number().finite().min(0),
  y: z.number().finite().min(0),
  text: z.string().trim().max(240),
});
export type StationReminder = z.infer<typeof reminderSchema>;
export const reminderCommandSchema = z.discriminatedUnion('action', [
  stationClaimSchema.extend({ action: z.literal('save'), reminder: reminderSchema }),
  stationClaimSchema.extend({ action: z.literal('delete'), id: z.uuid() }),
]);
