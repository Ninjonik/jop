import { z } from 'zod';

// Passenger designations: ŽSR GVD 2025/2026, section 3.1.
// Earlier Slovak freight designations are retained for historical timetables.
export const trainCategoryGroups = [
  {
    label: 'Osobná doprava',
    categories: [
      ['SC', 'SuperCity'],
      ['EC', 'EuroCity'],
      ['EN', 'EuroNight'],
      ['IC', 'InterCity'],
      ['Ex', 'Expres'],
      ['R', 'Rýchlik'],
      ['RR', 'Regionálny rýchlik'],
      ['ER', 'EuroRegio'],
      ['REX', 'Regionálny expres'],
      ['Zr', 'Zrýchlený vlak'],
      ['Sp', 'Spešný vlak'],
      ['Os', 'Osobný vlak'],
      ['railjet', 'railjet'],
      ['rj', 'railjet (skrátené označenie)'],
      ['rjx', 'railjet xpress'],
      ['RJ', 'RegioJet'],
      ['IN', 'InterNight'],
      ['NJ', 'Nightjet'],
    ],
  },
  {
    label: 'Nákladná doprava',
    categories: [
      ['Nex', 'Expresný nákladný vlak'],
      ['Rn', 'Rýchlonákladný vlak'],
      ['Zn', 'Zrýchlený nákladný vlak'],
      ['Pn', 'Priebežný nákladný vlak'],
      ['Vn', 'Vyrovnávkový nákladný vlak'],
      ['Mn', 'Manipulačný nákladný vlak'],
      ['Pv', 'Prestavný nákladný vlak'],
      ['Vleč', 'Vlečkový vlak'],
    ],
  },
  {
    label: 'Súpravové, rušňové a služobné vlaky',
    categories: [
      ['Sv', 'Súpravový vlak'],
      ['Rv', 'Rušňový vlak'],
      ['Lv', 'Lokomotívny vlak (staršie označenie)'],
      ['Sl', 'Služobný vlak'],
      ['Služ', 'Služobný vlak (staršie označenie)'],
      ['P', 'Pracovný vlak'],
    ],
  },
] as const;

export const trainCategoryCodes = trainCategoryGroups.flatMap((group) =>
  group.categories.map(([code]) => code),
);
export const trainCategorySchema = z.enum(trainCategoryCodes);
export type TrainCategory = z.infer<typeof trainCategorySchema>;
