import { z } from 'zod';
export const railwayLineSchema = z
  .object({
    id: z.uuid(),
    placeId: z.string().regex(/^[1-9]\d{0,31}$/),
    name: z.string().trim().min(1).max(128),
    stations: z.array(z.string().trim().min(1).max(64)).min(2).max(100),
  })
  .refine(
    (line) => new Set(line.stations).size === line.stations.length,
    'Stanice na trati sa nesmú opakovať.',
  );
export type RailwayLine = z.infer<typeof railwayLineSchema>;
