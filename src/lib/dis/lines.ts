import { z } from 'zod';
import { sectionSchema } from './gvd-planning';
export const railwayLineSchema = z
  .object({
    id: z.uuid(),
    placeId: z.string().regex(/^[1-9]\d{0,31}$/),
    name: z.string().trim().min(1).max(128),
    stations: z.array(z.string().trim().min(1).max(64)).min(2).max(100),
    sections: z.array(sectionSchema).max(200).optional(),
    stationTracks: z
      .array(
        z.object({
          station: z.string().min(1).max(128),
          track: z.string().min(1).max(16),
          lengthM: z.number().positive().max(10000),
          clearanceSeconds: z.number().min(0).max(3600),
        }),
      )
      .max(1000)
      .optional(),
  })
  .refine(
    (line) => new Set(line.stations).size === line.stations.length,
    'Stanice na trati sa nesmú opakovať.',
  )
  .refine(
    (line) =>
      !line.sections?.some(
        (s) => !line.stations.includes(s.from) || !line.stations.includes(s.to) || s.from === s.to,
      ),
    'Profil úseku musí patriť staniciam trate.',
  )
  .refine(
    (line) =>
      !line.sections ||
      new Set(line.sections.map((s) => JSON.stringify([s.from, s.to]))).size ===
        line.sections.length,
    'Smerový úsek sa nesmie opakovať.',
  )
  .refine(
    (line) => !line.stationTracks?.some((t) => !line.stations.includes(t.station)),
    'Staničná koľaj musí patriť dopravni na trati.',
  )
  .refine(
    (line) =>
      !line.stationTracks ||
      new Set(line.stationTracks.map((t) => JSON.stringify([t.station, t.track]))).size ===
        line.stationTracks.length,
    'Staničná koľaj sa nesmie opakovať.',
  );
export type RailwayLine = z.infer<typeof railwayLineSchema>;
