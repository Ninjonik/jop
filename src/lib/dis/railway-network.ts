import { z } from 'zod';
export const pointKinds = ['Stanica', 'Zastávka', 'Odbočka', 'Výhybňa', 'Hradlo'] as const;
export const operatingSymbols = [
  ['speed', 'Rýchlostná návestná sústava'],
  ['P', 'Vzájomne závislé hlavné návestidlá bez rýchlostnej sústavy'],
  ['S', 'Skupinové odchodové návestidlá'],
  ['N', 'Nezávislé hlavné návestidlá'],
  ['B', 'Bez odchodových návestidiel'],
  ['dispatch', 'Výprava návesťou hlavného návestidla zakázaná'],
  ['cross', 'Svetelný kríž neplatnosti'],
  ['closed', 'Výluka dopravnej služby'],
  ['closedCalendar', 'Výluka dopravnej služby s kalendárnym obmedzením'],
  ['occupied', 'Pravidelný vchod na obsadenú koľaj'],
  ['deadend', 'Pravidelný vchod na slepú koľaj'],
  ['report', 'Ohlasovacia povinnosť zrušená'],
  ['trapezoid', 'Zastavenie pred lichobežníkovou tabuľkou'],
] as const;
const symbolSchema = z.enum(operatingSymbols.map(([id]) => id));
export const railwayNetworkSchema = z
  .object({
    points: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(128),
          name: z.string().trim().min(1).max(128),
          kind: z.enum(pointKinds),
          x: z.number().int().min(0).max(4000),
          y: z.number().int().min(0).max(4000),
          symbols: z.array(symbolSchema).max(13),
        }),
      )
      .max(200),
    sections: z
      .array(
        z.object({
          id: z.string().min(1).max(128),
          from: z.string().min(1).max(128),
          to: z.string().min(1).max(128),
          tracks: z.union([z.literal(1), z.literal(2)]),
          block: z.enum(['unknown', 'AH', 'AB']).default('unknown'),
          against: z.boolean().default(false),
          speed: z.number().int().min(1).max(300).optional(),
          requiredBrakePercent: z.number().int().min(1).max(300).optional(),
        }),
      )
      .max(400),
  })
  .superRefine((network, ctx) => {
    const ids = new Set(network.points.map((p) => p.id));
    if (ids.size !== network.points.length)
      ctx.addIssue({ code: 'custom', message: 'Dopravné body musia mať jedinečné označenia.' });
    if (new Set(network.sections.map((s) => s.id)).size !== network.sections.length)
      ctx.addIssue({ code: 'custom', message: 'Úseky musia mať jedinečné označenia.' });
    const pairs = new Set<string>();
    for (const section of network.sections) {
      const key = JSON.stringify([section.from, section.to].sort());
      if (
        !ids.has(section.from) ||
        !ids.has(section.to) ||
        section.from === section.to ||
        pairs.has(key)
      )
        ctx.addIssue({ code: 'custom', message: 'Skontrolujte spojenia medzi dopravnými bodmi.' });
      pairs.add(key);
    }
    for (const p of network.points) {
      if (p.symbols.includes('speed') && p.symbols.includes('P'))
        ctx.addIssue({
          code: 'custom',
          message: 'Rýchlostná sústava a značka P sa navzájom vylučujú.',
        });
      if (['S', 'N', 'B'].filter((s) => p.symbols.includes(s as 'S' | 'N' | 'B')).length > 1)
        ctx.addIssue({
          code: 'custom',
          message: 'Vyberte iba jeden druh odchodových návestidiel: S, N alebo B.',
        });
    }
  });
export type RailwayNetwork = z.infer<typeof railwayNetworkSchema>;
export type NetworkSnapshot = { network: RailwayNetwork; updatedAt: string | null };
export function pointKind(name: string): (typeof pointKinds)[number] {
  if (/^AH\s|^AHr\./i.test(name)) return 'Hradlo';
  if (/^odb\./i.test(name)) return 'Odbočka';
  if (/^výh[ .]/i.test(name)) return 'Výhybňa';
  return /\sz\.?$/.test(name) ? 'Zastávka' : 'Stanica';
}
export function seedRailwayNetwork(placeId: string): RailwayNetwork {
  if (placeId !== '113144512557419') return { points: [], sections: [] };
  const rows: [string, string, number, number][] = [
    ['klenov', 'Klenov', 80, 620],
    ['dvorniky', 'Dvorníky z', 280, 560],
    ['dvorniky-zastavka', 'Dvorníky zastávka z', 280, 700],
    ['solinky', 'odb. Solinky', 500, 560],
    ['nadezdovo', 'Nadeždovo', 720, 620],
    ['chym', 'odb. Chým', 1060, 620],
    ['teriakovce', 'Teriakovce', 720, 60],
    ['teriakovske-klacany', 'Teriakovské Kľačany', 720, 130],
    ['brekov', 'Brekov z', 720, 200],
    ['ah-brekov', 'AH Brekov', 720, 270],
    ['ranciska', 'Rančiská', 720, 340],
    ['ah-prilesie', 'AH Prílesie', 720, 410],
    ['povina', 'Povina z', 720, 480],
    ['vadan', 'Vadaň z', 1060, 720],
    ['vesele', 'Veselé', 1060, 800],
    ['mytna', 'Mýtna z', 1060, 880],
    ['stefanovo', 'Štefanovo z', 1060, 960],
    ['kolarovo', 'Kolárovo', 1060, 1040],
  ];
  const links: [number, number, 1 | 2][] = [
    [0, 1, 1],
    [1, 3, 1],
    [3, 4, 1],
    [0, 2, 2],
    [2, 4, 2],
    [4, 5, 2],
    [6, 7, 1],
    [7, 8, 1],
    [8, 9, 1],
    [9, 10, 1],
    [10, 11, 1],
    [11, 12, 1],
    [12, 3, 1],
    [5, 13, 1],
    [13, 14, 1],
    [14, 15, 1],
    [15, 16, 1],
    [16, 17, 1],
  ];
  return {
    points: rows.map(([id, name, x, y]) => ({
      id,
      name,
      x,
      y,
      kind: pointKind(name),
      symbols: [],
    })),
    sections: links.map(([a, b, tracks]) => ({
      id: rows[a][0] + '--' + rows[b][0],
      from: rows[a][0],
      to: rows[b][0],
      tracks,
      block: 'unknown',
      against: false,
    })),
  };
}
/** Follow explicit topology, including operating points between timetable stops. */
export function networkPath(network: RailwayNetwork, from: string, to: string): string[] {
  const queue = [[from]],
    seen = new Set([from]);
  for (let i = 0; i < queue.length; i++) {
    const path = queue[i],
      last = path.at(-1)!;
    if (last === to) return path;
    for (const s of network.sections) {
      const next = s.from === last ? s.to : s.to === last ? s.from : null;
      if (next && !seen.has(next)) {
        seen.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return [];
}
