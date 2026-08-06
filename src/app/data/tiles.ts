/*
 * Tile catalog for the Relay Railway Dispatcher Controller
 *
 * All entries in this object are called "components".
 * 1 tile is by default 75x75 px (though this can be scaled up/down)
 *
 * The space is measured in number of tiles.
 * 0,0 is (x,y) | min value: top left | max value: bottom right
 *
 * The used space tells us which tiles the component actually occupies.
 * (this uses our established coordinate system)
 *
 * The traversable is either false or an object that is indexed by numbers 0 ... n
 * These numbers represent all possible traversable states the component can have.
 * Values of those numbers are all the possible routes in this format:
 * from (x,y): to (x,y)
 * These values ought to be out of bounds of the component, since they described
 * in what way they are connected to other tiles.
 *
 */

import Board1Square from '@/app/assets/board/Board1Square';
import DispatcherBuilding1Square from '@/app/assets/board/DispatcherBuilding1Square';
import DepartureButton1Square from '@/app/assets/buttons/DepartureButton1Square';
import Lineblock6Square from '@/app/assets/buttons/Lineblock6Square';
import ShuntButtonNOOCP1Square from '@/app/assets/buttons/ShuntButtonNOOCP1Square';
import ShuntButton1Square from '@/app/assets/buttons/ShuntButton1Square';
import SignButtonLight1Square from '@/app/assets/buttons/SignButtonLight1Square';
import SignButtonSealedCounter1Square from '@/app/assets/buttons/SignButtonSealedCounter1Square';
import SignButton1Square from '@/app/assets/buttons/SignButton1Square';
import SwitchButton2Square from '@/app/assets/buttons/SwitchButton2Square';
import Departure2NOOCP1Square from '@/app/assets/signals/Departure2NOOCP1Square';
import Departure21Square from '@/app/assets/signals/Departure21Square';
import EntryNOOCP1Square from '@/app/assets/signals/EntryNOOCP1Square';
import Entry1Square from '@/app/assets/signals/Entry1Square';
import PremainNOOCP1Square from '@/app/assets/signals/PremainNOOCP1Square';
import Premain1Square from '@/app/assets/signals/Premain1Square';
import ShuntNOOCP1Square from '@/app/assets/signals/ShuntNOOCP1Square';
import Shunt1Square from '@/app/assets/signals/Shunt1Square';
import Sign46Square from '@/app/assets/signs/4Sign6Square';
import ShuntButtonSignalBUFFER1Square from '@/app/assets/special/ShuntButtonSignalBUFFER1Square';
import SwitchCrossoverNOOCP2Square from '@/app/assets/switches/SwitchCrossoverNOOCP2Square';
import SwitchCrossover2Square from '@/app/assets/switches/SwitchCrossover2Square';
import SwitchExtendedNOOCP6Square from '@/app/assets/switches/SwitchExtendedNOOCP6Square';
import SwitchExtended6Square from '@/app/assets/switches/SwitchExtended6Square';
import SwitchSingleNOOCP2Square from '@/app/assets/switches/SwitchSingleNOOCP2Square';
import SwitchSingle2Square from '@/app/assets/switches/SwitchSingle2Square';
import TrackNOOCP1Square from '@/app/assets/tracks/TrackNOOCP1Square';
import TrackSignNOOCP1Square from '@/app/assets/tracks/TrackSignNOOCP1Square';
import TrackSign1Square from '@/app/assets/tracks/TrackSign1Square';
import Track1Square from '@/app/assets/tracks/Track1Square';

export const tiles: any = {
  filler: {
    component: Board1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  dispatchPost: {
    component: DispatcherBuilding1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
    states: {
      default: { '--building-color': '#cfd3d6' },
      occupied: { '--building-color': '#ffcc00' },
      emergency: { '--building-color': '#ff0000' },
    },
  },
  departureButton: {
    component: DepartureButton1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  lineblock: {
    component: Lineblock6Square,
    space: {
      x: 3,
      y: 2,
    },
    usedSpace: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 0],
      [2, 1],
    ],
    traversable: false,
  },
  shuntButtonNoOcp: {
    component: ShuntButtonNOOCP1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  shuntButton: {
    component: ShuntButton1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
    states: {
      default: { '--main-color': '#acb0b3' },
      active: { '--main-color': '#ff0000' },
      locked: { '--main-color': '#00ff00' },
    },
  },
  signButtonLight: {
    component: SignButtonLight1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  signButtonSealedCounter: {
    component: SignButtonSealedCounter1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  signButton: {
    component: SignButton1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
    states: {
      default: { '--main-color': '#acb0b3' },
      active: { '--main-color': '#ff0000' },
      locked: { '--main-color': '#00ff00' },
    },
  },
  switchButton: {
    component: SwitchButton2Square,
    space: {
      x: 1,
      y: 2,
    },
    usedSpace: [
      [0, 0],
      [0, 1],
    ],
    traversable: false,
  },
  departureSignalNoOcp: {
    component: Departure2NOOCP1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  departureSignal: {
    component: Departure21Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
  },
  entrySignalNoOcp: {
    component: EntryNOOCP1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  entrySignal: {
    component: Entry1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
    states: {
      off: {},
      green: {},
    },
  },
  premainSignalNoOcp: {
    component: PremainNOOCP1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  premainSignal: {
    component: Premain1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
  },
  shuntSignalNoOcp: {
    component: ShuntNOOCP1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  shuntSignal: {
    component: Shunt1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
  },
  sign: {
    component: Sign46Square,
    space: {
      x: 4,
      y: 1,
    },
    usedSpace: [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ],
    traversable: false,
  },
  shuntSignalButtonBuffer: {
    component: ShuntButtonSignalBUFFER1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  crossoverSwitchNoOcp: {
    component: SwitchCrossoverNOOCP2Square,
    space: {
      x: 1,
      y: 2,
    },
    usedSpace: [
      [0, 0],
      [0, 1],
    ],
    traversable: false,
  },
  crossoverSwitch: {
    component: SwitchCrossover2Square,
    space: {
      x: 1,
      y: 2,
    },
    usedSpace: [
      [0, 0],
      [0, 1],
    ],
    traversable: {
      // both switches off
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
        '1,1': '-1,1',
        '-1,1': '1,1',
      },
      // both switches on
      1: {
        '-1,1': '1,0',
        '1,0': '-1,1',
      },
      // upper switch on
      2: {
        '1,1': '-1,1',
        '-1,1': '1,1',
      },
      // lower switch on
      3: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
  },
  extendedSwitchNoOcp: {
    component: SwitchExtendedNOOCP6Square,
    space: {
      x: 2,
      y: 3,
    },
    usedSpace: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
    traversable: false,
  },
  extendedSwitch: {
    component: SwitchExtended6Square,
    space: {
      x: 2,
      y: 3,
    },
    usedSpace: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
    traversable: {
      // both switches off
      0: {
        '-1,2': '1,2',
        '1,2': '-1,2',
      },
      // both switches on
      1: {
        '-1,2': '2,0',
        '2,0': '-1,2',
      },
      // upper switch on
      2: {
        '-1,2': '1,2',
        '1,2': '-1,2',
      },
      // lower switch on
      3: {
        '-1,2': '2,1',
        '2,1': '-1,2',
      },
    },
  },
  singleSwitchNoOcp: {
    component: SwitchSingleNOOCP2Square,
    space: {
      x: 1,
      y: 2,
    },
    usedSpace: [
      [0, 0],
      [0, 1],
    ],
    traversable: false,
  },
  singleSwitch: {
    component: SwitchSingle2Square,
    space: {
      x: 1,
      y: 2,
    },
    usedSpace: [
      [0, 0],
      [0, 1],
    ],
    traversable: {
      // switch off
      0: {
        '-1,1': '1,1',
        '1,1': '-1,1',
      },
      // switch on
      1: {
        '-1,1': '1,0',
        '1,0': '-1,1',
      },
    },
  },
  trackNoOcp: {
    component: TrackNOOCP1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  trackSignNoOcp: {
    component: TrackSignNOOCP1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
  },
  trackSign: {
    component: TrackSign1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
  },
  track: {
    component: Track1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        '1,0': '-1,0',
        '-1,0': '1,0',
      },
    },
  },
};
