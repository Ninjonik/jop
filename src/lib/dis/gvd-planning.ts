import { z } from 'zod';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    const parsed = new Date(`${s}T12:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s;
  }, 'Neplatný dátum.');
export const stockProfileSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
    version: z.number().int().positive(),
    quality: z.enum(['estimated', 'calibrated']),
    source: z.string().max(1000),
    locomotiveMassT: z.number().positive().max(1000),
    hauledMassT: z.number().min(0).max(20000),
    powerKW: z.number().positive().max(50000),
    maxEffortKN: z.number().positive().max(2000),
    maxSpeedKmh: z.number().positive().max(300),
    serviceBrakeMps2: z.number().positive().max(2),
    brakeBuildUpSeconds: z.number().min(0).max(60),
    tractionBuildUpSeconds: z.number().min(0).max(60),
    rotatingMassFactor: z.number().min(1).max(1.3),
    adhesion: z.number().min(0.01).max(0.5),
    resistanceA: z.number().min(0).max(100000),
    resistanceB: z.number().min(0).max(10000),
    resistanceC: z.number().min(0).max(1000),
    brakeMode: z.enum(['P', 'R', 'G']).optional(),
    brakedWeightT: z.number().positive().max(30000).optional(),
    axles: z.number().int().positive().max(1000).optional(),
    effortCurve: z
      .array(
        z.object({ speedKmh: z.number().min(0).max(300), effortKN: z.number().min(0).max(2000) }),
      )
      .max(100)
      .default([]),
  })
  .superRefine((p, ctx) => {
    if (p.quality === 'calibrated' && !p.source.trim())
      ctx.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'Kalibrovaný profil vyžaduje zdroj.',
      });
    if (p.effortCurve.some((point, i) => i > 0 && point.speedKmh <= p.effortCurve[i - 1].speedKmh))
      ctx.addIssue({
        code: 'custom',
        path: ['effortCurve'],
        message: 'Rýchlosti trakčnej krivky musia stúpať.',
      });
  });
export type StockProfile = z.infer<typeof stockProfileSchema>;
export const sectionSchema = z
  .object({
    from: z.string().min(1).max(128),
    to: z.string().min(1).max(128),
    version: z.number().int().positive(),
    source: z.string().max(1000),
    tracks: z.number().int().min(1).max(8),
    headwaySeconds: z.number().min(0).max(3600),
    segments: z
      .array(
        z.object({
          lengthM: z.number().positive().max(100000),
          speedKmh: z.number().positive().max(300),
          gradientPermille: z.number().min(-150).max(150),
        }),
      )
      .min(1)
      .max(100),
    brakeRequirements: z
      .array(
        z.object({
          mode: z.enum(['P', 'R', 'G']),
          maxAxles: z.number().int().positive().max(1000),
          maxSpeedKmh: z.number().positive().max(300),
          requiredPercent: z.number().positive().max(300),
        }),
      )
      .max(100)
      .optional(),
    blocks: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          startM: z.number().min(0),
          endM: z.number().positive(),
          clearanceSeconds: z.number().min(0).max(3600),
        }),
      )
      .max(100)
      .optional(),
  })
  .superRefine((section, ctx) => {
    const length = section.segments.reduce((n, s) => n + s.lengthM, 0);
    const ordered = [...(section.blocks || [])].sort((a, b) => a.startM - b.startM);
    if (
      ordered.some(
        (b, i) =>
          b.endM <= b.startM || b.endM > length || (i > 0 && ordered[i - 1].endM > b.startM),
      ) ||
      new Set(ordered.map((b) => b.id)).size !== ordered.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'Oddiely sa nesmú prekrývať ani presahovať dĺžku úseku.',
      });
  });
export type PlanningSection = z.infer<typeof sectionSchema>;
export const planningSchema = z
  .object({
    version: z.literal(1),
    daily: z.boolean().optional(),
    mode: z.enum(['manual', 'estimated', 'calibrated']),
    lineId: z.uuid().optional(),
    status: z.enum(['draft', 'active', 'retired']),
    era: z.enum(['2004/2005', '2005/2006', 'custom']),
    validFrom: date,
    validTo: date,
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    excludedDates: z.array(date).max(366),
    includedDates: z.array(date).max(366),
    allowancePercent: z.number().min(0).max(50),
    allowanceSeconds: z.number().min(0).max(3600),
    turnaroundMinutes: z.number().min(0).max(1440),
    stock: stockProfileSchema.optional(),
    booklet: z
      .object({
        locomotive: z.string().max(100).optional(),
        carrier: z.string().max(100).optional(),
        brakeMode: z.enum(['P', 'R', 'R+Mg', 'G']).optional(),
        note: z.string().max(500).optional(),
      })
      .optional(),
    calculationFingerprint: z.string().max(100).optional(),
  })
  .refine((p) => p.validFrom <= p.validTo, 'Koniec platnosti predchádza začiatku.')
  .refine(
    (p) => (Date.parse(p.validTo) - Date.parse(p.validFrom)) / 86400000 <= 740,
    'Obdobie GVD nesmie presiahnuť dva roky.',
  );
export type GvdPlanning = z.infer<typeof planningSchema>;

export function newPlanning(): GvdPlanning {
  return {
    version: 1,
    mode: 'manual',
    status: 'active',
    era: '2004/2005',
    validFrom: '2004-12-12',
    validTo: '2005-12-10',
    weekdays: [1, 2, 3, 4, 5, 6, 7],
    excludedDates: [],
    includedDates: [],
    allowancePercent: 5,
    allowanceSeconds: 0,
    turnaroundMinutes: 10,
  };
}
/** A starting example, explicitly not a verified locomotive calibration. */
export const estimated750: StockProfile = {
  id: '750-example',
  name: '750 + osobné vozne (odhad)',
  version: 1,
  quality: 'estimated',
  source: '',
  locomotiveMassT: 74,
  hauledMassT: 120,
  powerKW: 900,
  maxEffortKN: 180,
  maxSpeedKmh: 100,
  serviceBrakeMps2: 0.65,
  brakeBuildUpSeconds: 4,
  tractionBuildUpSeconds: 3,
  rotatingMassFactor: 1.06,
  adhesion: 0.22,
  resistanceA: 3000,
  resistanceB: 50,
  resistanceC: 6,
  effortCurve: [],
};
export function operatesOn(planning: GvdPlanning | undefined, day: string): boolean {
  if (!planning) return true;
  if (planning.daily) return planning.status !== 'retired';
  if (planning.status === 'retired' || day < planning.validFrom || day > planning.validTo)
    return false;
  if (planning.excludedDates.includes(day)) return false;
  if (planning.includedDates.includes(day)) return true;
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7;
  return planning.weekdays.includes(weekday);
}
export function calendarsOverlap(a?: GvdPlanning, b?: GvdPlanning, peerDayOffset = 0): boolean {
  if (a?.status === 'retired' || b?.status === 'retired') return false;
  if (a?.daily && b?.daily) return true;
  if (a?.daily) a = undefined;
  if (b?.daily) b = undefined;
  if (!a && !b) return true;
  if (!a || !b) {
    const calendar = (a || b)!;
    for (
      let day = new Date(`${calendar.validFrom}T12:00:00Z`);
      day.toISOString().slice(0, 10) <= calendar.validTo;
      day.setUTCDate(day.getUTCDate() + 1)
    )
      if (operatesOn(calendar, day.toISOString().slice(0, 10))) return true;
    return false;
  }
  const addDays = (date: string, days: number) => {
    const d = new Date(`${date}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const start = [a.validFrom, addDays(b.validFrom, -peerDayOffset)].sort().at(-1)!;
  const end = [a.validTo, addDays(b.validTo, -peerDayOffset)].sort()[0];
  for (
    let day = new Date(`${start}T12:00:00Z`);
    day.toISOString().slice(0, 10) <= end;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const value = day.toISOString().slice(0, 10);
    if (operatesOn(a, value) && operatesOn(b, addDays(value, peerDayOffset))) return true;
  }
  return false;
}
