import { boardColorsDark, boardColorsWithStripe } from './shared-styles';

import type { TileCatalog } from '@/app/components/tiles/tile-catalog';

import SwitchCrossover2Square from '@/app/assets/switches/SwitchCrossover2Square';
import SwitchCrossoverNOOCP2Square from '@/app/assets/switches/SwitchCrossoverNOOCP2Square';
import SwitchExtended6Square from '@/app/assets/switches/SwitchExtended6Square';
import SwitchExtendedNOOCP6Square from '@/app/assets/switches/SwitchExtendedNOOCP6Square';
import SwitchSingle2Square from '@/app/assets/switches/SwitchSingle2Square';
import SwitchSingleNOOCP2Square from '@/app/assets/switches/SwitchSingleNOOCP2Square';

export const switchTiles: TileCatalog = {
  crossoverSwitchNoOcp: {
    component: SwitchCrossoverNOOCP2Square,
    space: { x: 1, y: 2 },
    usedSpace: [
      [0, 0],
      [0, 1],
    ],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
    },
    texts: {
      topswitchtext: {
        fill: '#000000',
        size: '10px',
        text: 'Top Switch Text',
      },
      bottomswitchtext: {
        fill: '#000000',
        size: '10px',
        text: 'Bottom Switch Text',
      },
    },
  },

  crossoverSwitch: {
    component: SwitchCrossover2Square,
    space: { x: 1, y: 2 },
    usedSpace: [
      [0, 0],
      [0, 1],
    ],
    traversable: {
      tlTtrAblTbr: {
        '1,0': '-1,0',
        '-1,0': '1,0',
        '1,1': '-1,1',
        '-1,1': '1,1',
      },
      blTtr: {
        '-1,1': '1,0',
        '1,0': '-1,1',
      },
    },
    groups: {
      occupation: {
        states: ['default', 'setting', 'tlTtrAblTbr', 'blTtr'],
        defaultState: 'default',
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
    },
    texts: {
      topswitchtext: {
        fill: '#000000',
        size: '10px',
        text: 'Top Switch Text',
      },
      bottomswitchtext: {
        fill: '#000000',
        size: '10px',
        text: 'Bottom Switch Text',
      },
    },
  },

  extendedSwitchNoOcp: {
    component: SwitchExtendedNOOCP6Square,
    space: { x: 2, y: 3 },
    usedSpace: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
    },
    texts: {
      bottomswitchtext: {
        fill: '#000000',
        size: '10px',
        text: 'Lower Switch Text',
      },
      topswitchtext: {
        fill: '#000000',
        size: '10px',
        text: 'Upper Switch Text',
      },
    },
  },

  extendedSwitch: {
    component: SwitchExtended6Square,
    space: { x: 2, y: 3 },
    usedSpace: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
    traversable: {
      blTbr: {
        '-1,2': '1,2',
        '1,2': '-1,2',
      },
      blTtr: {
        '-1,2': '2,0',
        '2,0': '-1,2',
      },
      blTmr: {
        '-1,2': '2,1',
        '2,1': '-1,2',
      },
    },
    groups: {
      occupation: {
        states: ['default', 'setting', 'blTbr', 'blTtr', 'blTmr'],
        defaultState: 'default',
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
    },
    texts: {
      bottomswitchtext: {
        fill: '#000000',
        size: '10px',
        text: 'Lower Switch Text',
      },
      topswitchtext: {
        fill: '#000000',
        size: '10px',
        text: 'Upper Switch Text',
      },
    },
  },

  singleSwitchNoOcp: {
    component: SwitchSingleNOOCP2Square,
    space: { x: 1, y: 2 },
    usedSpace: [
      [0, 0],
      [0, 1],
    ],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
    },
    texts: {
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  singleSwitch: {
    component: SwitchSingle2Square,
    space: { x: 1, y: 2 },
    usedSpace: [
      [0, 0],
      [0, 1],
    ],
    traversable: {
      blTbr: {
        '-1,1': '1,1',
        '1,1': '-1,1',
      },
      blTtr: {
        '-1,1': '1,0',
        '1,0': '-1,1',
      },
    },
    groups: {
      occupation: {
        states: ['default', 'setting', 'blTbr', 'blTtr', 't'],
        defaultState: 'default',
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
    },
    texts: {
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },
};
