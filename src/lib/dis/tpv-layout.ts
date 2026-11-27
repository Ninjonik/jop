import { z } from 'zod';
export const tpvLayoutSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60),
  lineId: z.string().max(64),
  first: z.string().max(128),
  last: z.string().max(128),
  hidden: z.array(z.string().max(128)).max(200),
});
export type TpvLayout = z.infer<typeof tpvLayoutSchema>;
export function readTpvLayouts(value: string): TpvLayout[] {
  try {
    return z.array(tpvLayoutSchema).max(12).parse(JSON.parse(value));
  } catch {
    return [];
  }
}
