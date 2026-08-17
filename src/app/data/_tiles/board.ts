import { boardColors, boardColorsDark } from './shared-styles';

import type { TileCatalog } from '@/app/components/tiles/tile-catalog';

import Board1Square from '@/app/assets/board/Board1Square';
import DispatcherBuilding1Square from '@/app/assets/board/DispatcherBuilding1Square';

export const boardTiles: TileCatalog = {
  filler: {
    component: Board1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: boardColors,
  },

  dispatchPost: {
    component: DispatcherBuilding1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      '--color-27282b': '#27282b',
      '--color-343638': '#343638',
      '--stripe-color': '#3b3b3b',
      '--color-424345': '#424345',
      '--color-6c6c6f': '#6c6c6f',
      '--color-767879': '#767879',
      '--color-7e8083': '#7e8083',
      '--color-898b8e': '#898b8e',
      '--color-8f9395': '#8f9395',
      '--color-95999c': '#95999c',
      '--color-9fa3a6': '#9fa3a6',
      '--color-a5a9ac': '#a5a9ac',
      '--main-color': '#acb0b3',
      '--bg-color': '#b4bbbd',
      '--color-b9bdc0': '#b9bdc0',
      '--color-c5c9cb': '#c5c9cb',
      '--color-cfd3d6': '#cfd3d6',
      '--color-d9d9d9': '#d9d9d9',
      '--color-fdfefe': '#fdfefe',
    },
  },
};
