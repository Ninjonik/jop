import type { TileCatalog } from '@/app/components/tiles/tile-catalog';

import Sign1_1Square from '@/app/assets/signs/1Sign1Square';
import Sign2_2Square from '@/app/assets/signs/2Sign2Square';
import Sign3_3Square from '@/app/assets/signs/3Sign3Square';
import Sign46Square from '@/app/assets/signs/4Sign6Square';

export const signTiles: TileCatalog = {
  sign1: {
    component: Sign1_1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    texts: { text: { fill: '#000000', size: '18px', text: 'Text' } },
  },

  sign2: {
    component: Sign2_2Square,
    space: { x: 2, y: 1 },
    usedSpace: [[0, 0], [1, 0]],
    traversable: false,
    texts: { text: { fill: '#000000', size: '22px', text: 'Text' } },
  },

  sign3: {
    component: Sign3_3Square,
    space: { x: 3, y: 1 },
    usedSpace: [[0, 0], [1, 0], [2, 0]],
    traversable: false,
    texts: { text: { fill: '#000000', size: '24px', text: 'Text' } },
  },

  sign: {
    component: Sign46Square,
    space: { x: 4, y: 1 },
    usedSpace: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    traversable: false,
    texts: {
      text: {
        fill: '#000000',
        size: '26px',
        text: 'Text',
      },
    },
  },
};
