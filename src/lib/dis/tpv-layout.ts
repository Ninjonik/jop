import { z } from 'zod';
export const tpvLayoutSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(60),
  lineId: z.string().max(64),
  first: z.string().max(128),
  last: z.string().max(128),
  order: z.array(z.string().max(128)).max(200).default([]),
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

/** Move an operating point without changing its identity or timetable route. */
export function reorderTpvStations(order: string[], from: string, to: string) {
  if (from === to || !order.includes(from) || !order.includes(to)) return order;
  const result = order.filter((id) => id !== from);
  result.splice(order.indexOf(to), 0, from);
  return result;
}
