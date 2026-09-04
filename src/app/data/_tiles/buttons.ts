import { boardColorsDark, boardColorsWithStripe } from './shared-styles';

import type { TileCatalog } from '@/app/components/tiles/tile-catalog';

import DepartureButton1Square from '@/app/assets/buttons/DepartureButton1Square';
import Lineblock6Square from '@/app/assets/buttons/Lineblock6Square';
import ShuntButton1Square from '@/app/assets/buttons/ShuntButton1Square';
import ShuntButtonNOOCP1Square from '@/app/assets/buttons/ShuntButtonNOOCP1Square';
import SignButton1Square from '@/app/assets/buttons/SignButton1Square';
import SignButtonLight1Square from '@/app/assets/buttons/SignButtonLight1Square';
import SignButtonSealedCounter1Square from '@/app/assets/buttons/SignButtonSealedCounter1Square';
import SwitchButton2Square from '@/app/assets/buttons/SwitchButton2Square';

export const buttonTiles: TileCatalog = {
  departureButton: {
    component: DepartureButton1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsWithStripe,
      '--color-shunt': '#696969',
      '--color-departure': '#121f1e',
    },
    groups: {
      button: {
        states: ['default', 'departure', 'shunt'],
        defaultState: 'default',
      },
    },
  },

  lineblock: {
    component: Lineblock6Square,
    space: { x: 3, y: 2 },
    usedSpace: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
      [2, 1],
    ],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      '--color-1a1a1a': '#1a1a1a',
      '--color-333': '#333',
      '--color-616161': '#616161',
      '--color-828282': '#828282',
      '--color-949494': '#949494',
      '--detail-color': '#6e6e6e',
      '--main-color-alt': '#b3b3b3',
    },
    groups: {
      lineblock: {
        states: [
          'default',
          'sending',
          'sendingFree',
          'receiving',
          'receivingFree',
          'receivingAwaitingConfirmation',
        ],
        defaultState: 'default',
      },
    },
    texts: {
      bottomlefttext: {
        fill: '#000000',
        size: '8px',
        text: 'Bottom Left Text',
      },
      toplefttext: {
        fill: '#000000',
        size: '8px',
        text: 'Top Left Text',
      },
      middletext: {
        fill: '#000000',
        size: '8px',
        text: 'Middle Text',
      },
      toprighttext: {
        fill: '#000000',
        size: '8px',
        text: 'Top Right Text',
      },
      bottomrighttext: {
        fill: '#000000',
        size: '8px',
        text: 'Bottom Right',
      },
    },
  },

  shuntButtonNoOcp: {
    component: ShuntButtonNOOCP1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    // This is a shunt control without an occupation sensor, not a track break.
    // Normal platform routes must be able to pass it on the way to a departure button.
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
    staticStyles: {
      ...boardColorsWithStripe,
      '--color-696969': '#696969',
    },
    groups: {
      button: {
        states: ['default', 'departure', 'shunt'],
        defaultState: 'default',
      },
    },
  },

  shuntButton: {
    component: ShuntButton1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
    staticStyles: {
      ...boardColorsWithStripe,
      '--main-color': '#acb0b3',
    },
    groups: {
      button: {
        states: ['default', 'departure', 'shunt'],
        defaultState: 'default',
      },
      occupation: {
        states: ['default', 'reserved', 'occupied'],
        defaultState: 'default',
      },
    },
  },

  signButtonLight: {
    component: SignButtonLight1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      '--color-333': '#333',
      '--detail-color': '#6e6e6e',
      '--main-color-alt': '#b3b3b3',
    },
    groups: {
      button: {
        states: ['default', 'shunt', 'danger'],
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

  signButtonSealedCounter: {
    component: SignButtonSealedCounter1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      '--color-1f1f1f': '#1f1f1f',
      '--color-242424': '#242424',
      '--color-383838': '#383838',
      '--color-949494': '#949494',
      '--color-960000': '#960000',
      '--color-c2c2c2': '#c2c2c2',
      '--color-pn-seal': '#424345',
      '--pn-seal-opacity': '1',
    },
    groups: {
      seal: {
        states: ['sealed', 'unsealed'],
        defaultState: 'sealed',
      },
    },
    texts: {
      digit6: {
        fill: '#D3D3D3',
        size: '6px',
        text: '0',
      },
      digit5: {
        fill: '#D3D3D3',
        size: '6px',
        text: '0',
      },
      digit4: {
        fill: '#D3D3D3',
        size: '6px',
        text: '0',
      },
      digit3: {
        fill: '#D3D3D3',
        size: '6px',
        text: '0',
      },
      digit2: {
        fill: '#D3D3D3',
        size: '6px',
        text: '0',
      },
      digit1: {
        fill: '#D3D3D3',
        size: '6px',
        text: '0',
      },
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  signButton: {
    component: SignButton1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      '--color-949494': '#949494',
      '--color-c2c2c2': '#c2c2c2',
    },
    texts: {
      text: {
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  switchButton: {
    component: SwitchButton2Square,
    space: { x: 1, y: 2 },
    usedSpace: [
      [0, 0],
      [0, 1],
    ],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
      '--color-333': '#333',
      '--color-left': '#333',
      '--color-middle': '#333',
      '--color-right': '#333',
      '--color-a1a1a1': '#a1a1a1',
      '--lever-angle': '0deg',
    },
    groups: {
      switch: {
        states: [
          'default',
          'left',
          'right',
          'leftSet',
          'middleSet',
          'rightSet',
          'leftSetting',
          'middleSetting',
          'rightSetting',
        ],
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
