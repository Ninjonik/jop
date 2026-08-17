import { boardColorsDark, boardColorsWithStripe, signalColors } from './shared-styles';

import type { TileCatalog } from '@/app/components/tiles/tile-catalog';

import Departure21Square from '@/app/assets/signals/Departure21Square';
import Departure2NOOCP1Square from '@/app/assets/signals/Departure2NOOCP1Square';
import Entry1Square from '@/app/assets/signals/Entry1Square';
import EntryNOOCP1Square from '@/app/assets/signals/EntryNOOCP1Square';
import Premain1Square from '@/app/assets/signals/Premain1Square';
import PremainNOOCP1Square from '@/app/assets/signals/PremainNOOCP1Square';
import Shunt1Square from '@/app/assets/signals/Shunt1Square';
import ShuntNOOCP1Square from '@/app/assets/signals/ShuntNOOCP1Square';
import ShuntButtonSignalBUFFER1Square from '@/app/assets/special/ShuntButtonSignalBUFFER1Square';

export const signalTiles: TileCatalog = {
  departureSignalNoOcp: {
    component: Departure2NOOCP1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      ...signalColors,
      ...boardColorsWithStripe,
      '--color-121f1e': '#121f1e',
      '--color-4f4f4f': '#4f4f4f',
      '--color-696969': '#696969',
      '--color-departure': '#121f1e',
      '--color-shunt': '#696969',
    },
    groups: {
      signal: {
        states: ['default', 'departure', 'shunt'],
        defaultState: 'default',
      },
    },
    texts: {
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  departureSignal: {
    component: Departure21Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...signalColors,
      ...boardColorsWithStripe,
      '--color-121f1e': '#121f1e',
      '--color-4f4f4f': '#4f4f4f',
      '--color-696969': '#696969',
      '--color-departure': '#121f1e',
      '--color-shunt': '#696969',
    },
    groups: {
      signal: {
        states: ['default', 'departure', 'shunt'],
        defaultState: 'default',
      },
      occupation: {
        states: ['default', 'reserved', 'occupied'],
        defaultState: 'default',
      },
    },
    texts: {
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  entrySignalNoOcp: {
    component: EntryNOOCP1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      ...signalColors,
      ...boardColorsWithStripe,
      '--color-121f1e': '#121f1e',
      '--color-1f1212': '#1f1212',
      '--color-261f10': '#261f10',
      '--color-4f4f4f': '#4f4f4f',
      '--color-696969': '#696969',
      '--color-departure': '#121f1e',
      '--color-shunt': '#696969',
      '--color-danger': '#1f1212',
      '--color-caution': '#261f10',
    },
    groups: {
      signal: {
        states: ['default', 'danger', 'departure', 'caution', 'shunt'],
        defaultState: 'default',
      },
    },
    texts: {
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  entrySignal: {
    component: Entry1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...signalColors,
      ...boardColorsWithStripe,
      '--color-121f1e': '#121f1e',
      '--color-1f1212': '#1f1212',
      '--color-261f10': '#261f10',
      '--color-4f4f4f': '#4f4f4f',
      '--color-696969': '#696969',
      '--color-departure': '#121f1e',
      '--color-shunt': '#696969',
      '--color-danger': '#1f1212',
      '--color-caution': '#261f10',
    },
    groups: {
      signal: {
        states: ['default', 'danger', 'departure', 'caution', 'shunt'],
        defaultState: 'default',
      },
      occupation: {
        states: ['default', 'reserved', 'occupied'],
        defaultState: 'default',
      },
    },
    texts: {
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  premainSignalNoOcp: {
    component: PremainNOOCP1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
      '--color-departure': '#121f1e',
      '--color-4f4f4f': '#4f4f4f',
    },
    groups: {
      signal: {
        states: ['default', 'departure'],
        defaultState: 'default',
      },
    },
    texts: {
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  premainSignal: {
    component: Premain1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
      '--color-departure': '#121f1e',
      '--color-4f4f4f': '#4f4f4f',
    },
    groups: {
      signal: {
        states: ['default', 'departure'],
        defaultState: 'default',
      },
      occupation: {
        states: ['default', 'reserved', 'occupied'],
        defaultState: 'default',
      },
    },
    texts: {
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  shuntSignalNoOcp: {
    component: ShuntNOOCP1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
      '--color-4f4f4f': '#4f4f4f',
      '--color-696969': '#696969',
    },
    groups: {
      signal: {
        states: ['default', 'shunt'],
        defaultState: 'default',
      },
    },
    texts: {
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  shuntSignal: {
    component: Shunt1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
      '--color-4f4f4f': '#4f4f4f',
      '--color-696969': '#696969',
    },
    groups: {
      signal: {
        states: ['default', 'shunt'],
        defaultState: 'default',
      },
      occupation: {
        states: ['default', 'reserved', 'occupied'],
        defaultState: 'default',
      },
    },
    texts: {
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  shuntSignalButtonBuffer: {
    component: ShuntButtonSignalBUFFER1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
      '--color-4f4f4f': '#4f4f4f',
      '--color-696969': '#696969',
    },
    groups: {
      signal: {
        states: ['default', 'shunt'],
        defaultState: 'default',
      },
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
