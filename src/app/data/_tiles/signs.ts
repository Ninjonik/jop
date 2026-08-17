import type { TileCatalog } from '@/app/components/tiles/tile-catalog';

import Sign46Square from '@/app/assets/signs/4Sign6Square';

export const signTiles: TileCatalog = {
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
