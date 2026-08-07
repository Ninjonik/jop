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
 *
 * ---------------------------------------------------------------------------
 * `globalStates` format (Catalog Level)
 * ---------------------------------------------------------------------------
 * You can define top-level reusable preset states outside of individual tile definitions.
 * Global preset state keys are conventionally suffixed with 'S' (e.g. `departureActiveS`).
 *
 * Example:
 *   export const globalStates: TileStates = {
 *     departureActiveS: { "--color-departure": "#00ff00" },
 *     occupiedS: { "--occupation-color": "#ff0000" },
 *   };
 *
 * ---------------------------------------------------------------------------
 * `states` format (Component Level)
 * ---------------------------------------------------------------------------
 * `states` maps named visual states (`default`, `active`, etc.) or contains
 * a shorthand string importing preset states directly.
 *
 * Space-Separated Shorthand Syntax:
 *  - `"states": "departureBlinking shuntActive occupied"`
 *    Automatically generates individual interactive visual states for each item in the string
 *    by appending 'S' to look up global presets (`departureBlinkingS`, `shuntActiveS`, etc.).
 *
 * Property Keys inside state objects:
 *  - Starts with "--"      => Treated as a CSS custom property (inline variable).
 *                               e.g. "--main-color": "#ff0000"
 *  - "css"                 => Plain CSS string applied directly via inline style.
 *  - "tailwind"            => Space-separated Tailwind classes (auto-prefixed with !).
 *  - "class"               => Plain CSS class name(s) from globals.css.
 *  - "states"              => Space-separated string (or Array) of state names to inherit from.
 *                             If a key without 'S' is passed, it automatically checks for 'S'.
 *
 * Example of mixing and matching:
 *
 *   // 1. Shorthand String (Generates interactive options dynamically):
 *   states: {
 *     states: "departureBlinking shuntBlinking departureActive"
 *   }
 *
 *   // 2. Custom Explicit Mapping + Inheritance:
 *   states: {
 *     default: { "--bg-color": "#b4bbbd" },
 *     activeBlinking: {
 *       states: "departureBlinking shuntActive", // Inherits presets + adds custom props
 *       css: "outline: 2px solid yellow;",
 *     }
 *   }
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
import {TileStates} from "@/app/components/test/bounds/TileCatalogViewerClient";

export const globalStates: TileStates = {
  departureActiveS: {
    "--color-departure": "#009e49",
  },
  shuntActiveS: {
    "--color-shunt": "#e2e8f0",
  },
  dangerActiveS: {
    "--color-danger": "#d32f2f",
  },
  cautionActiveS: {
    "--color-caution": "#e69f00",
  },
  departureBlinkingS: {
    "states": "departureActive",
    "--color-departure-blink": "#121f1e",
    "--departure-animation": "departure-blink 1s infinite",
  },
  shuntBlinkingS: {
    "states": "shuntActive",
    "--color-shunt-blink": "#696969",
    "--shunt-animation": "shunt-blink 1s infinite",
  },
  dangerBlinkingS: {
    "states": "dangerActive",
    "--color-danger-blink": "#1f1212",
    "--danger-animation": "danger-blink 1s infinite",
  },
  cautionBlinkingS: {
    "states": "cautionActive",
    "--color-caution-blink": "#261f10",
    "--caution-animation": "caution-blink 1s infinite",
  },
  occupiedS: {
    "--occupation-color": "#ff0000",
  },
  reservedS: {
    "--occupation-color": "#ffffff",
  },
  shuntActiveOccupiedS: {
    "states": "shuntActive occupiedS",
  },
  shuntActiveReservedS: {
    "states": "shuntActive reservedS",
  },
  departureActiveOccupiedS: {
    "states": "departureActive occupiedS",
  },
  departureActiveReservedS: {
    "states": "departureActive reservedS",
  },
  dangerActiveOccupiedS: {
    "states": "dangerActive occupiedS",
  },
  dangerActiveReservedS: {
    "states": "dangerActive reservedS",
  },
  cautionActiveOccupiedS: {
    "states": "cautionActive occupiedS",
  },
  cautionActiveReservedS: {
    "states": "cautionActive reservedS",
  }
}

export const tiles: any = {
  filler: {
    component: Board1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
    states: {
      default: {
        "--bg-color": "#b4bbbd"
      },
    },
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
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
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
    states: {
      default: {
        "--color-shunt": "#696969",
        "--stripe-color": "#3b3b3b",
        "--detail-color": "#6e6e6e",
        "--main-color-alt": "#b3b3b3",
        "--bg-color": "#b4bbbd",
        "--color-departure": "#121f1e"
      },
      states: "departureBlinking shuntBlinking departureActive shuntActive",
    },
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
    states: {
      default: {
        "--color-1a1a1a": "#1a1a1a",
        "--color-27282b": "#27282b",
        "--color-333": "#333",
        "--color-343638": "#343638",
        "--color-424345": "#424345",
        "--color-616161": "#616161",
        "--color-6c6c6f": "#6c6c6f",
        "--detail-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-828282": "#828282",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-949494": "#949494",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--main-color-alt": "#b3b3b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe",
        "--color-topleftcircle": "#333",
        "--color-middlecircle": "#333",
        "--color-toprightcircle": "#333",
        "--color-bottomleftcircle": "#333",
        "--color-bottomrightcircle": "#616161",
      },
      sending: {
        "--color-topleftcircle": "#00ff00",
      },
      sendingFree: {
        "--color-topleftcircle": "#00ff00",
        "--color-middlecircle": "#ffffff",
      },
      receiving: {
        "--color-toprightcircle": "#ff0000",
      },
      receivingFree: {
        "--color-toprightcircle": "#ff0000",
        "--color-middlecircle": "#ffffff",
      },
      receivingConfirmation: {
        "--color-toprightcircle": "#ff0000",
        "--color-bottomleftcircle": "#ffffff",
      },
    },
    texts: {
      "bottomlefttext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Bottom Left Text"
      },
      "toplefttext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Top Left Text"
      },
      "middletext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Middle Text"
      },
      "toprighttext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Top Right Text"
      },
      "bottomrighttext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Bottom Right"
      }
    },
  },
  shuntButtonNoOcp: {
    component: ShuntButtonNOOCP1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
    states: {
      default: {
        "--stripe-color": "#3b3b3b",
        "--detail-color": "#6e6e6e",
        "--main-color-alt": "#b3b3b3",
        "--bg-color": "#b4bbbd",
        "--color-696969": "#696969"
      },
      states: "shuntBlinking shuntActive",
    },
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
      default: {
        "--stripe-color": "#3b3b3b",
        "--occupation-color": "#6e6e6e",
        "--main-color": "#acb0b3",
        "--main-color-alt": "#b3b3b3",
        "--bg-color": "#b4bbbd"
      },
      states: "shuntBlinking shuntActive occupied reserved shuntActiveOccupied shuntActiveReserved",
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
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-333": "#333",
        "--color-343638": "#343638",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--detail-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--main-color-alt": "#b3b3b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
      states: "shuntBlinking shuntActive",
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
    },
  },
  signButtonSealedCounter: {
    component: SignButtonSealedCounter1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
    states: {
      default: {
        "--color-1f1f1f": "#1f1f1f",
        "--color-242424": "#242424",
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--color-383838": "#383838",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-949494": "#949494",
        "--color-95999c": "#95999c",
        "--color-960000": "#960000",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c2c2c2": "#c2c2c2",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "digit6": {
        "fill": "#D3D3D3",
        "size": "6px",
        "text": "0"
      },
      "digit5": {
        "fill": "#D3D3D3",
        "size": "6px",
        "text": "0"
      },
      "digit4": {
        "fill": "#D3D3D3",
        "size": "6px",
        "text": "0"
      },
      "digit3": {
        "fill": "#D3D3D3",
        "size": "6px",
        "text": "0"
      },
      "digit2": {
        "fill": "#D3D3D3",
        "size": "6px",
        "text": "0"
      },
      "digit1": {
        "fill": "#D3D3D3",
        "size": "6px",
        "text": "0"
      },
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
    },
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
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-949494": "#949494",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c2c2c2": "#c2c2c2",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
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
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-333": "#333",
        "--color-left": "#333",
        "--color-middle": "#333",
        "--color-right": "#333",
        "--color-343638": "#343638",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--detail-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a1a1a1": "#a1a1a1",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--main-color-alt": "#b3b3b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe",
        "--lever-angle": "0deg",
      },
      leftSet: {
        "--color-left": "#00ff00",
        "--lever-angle": "-40deg",
      },
      middleSet: {
        "--color-middle": "#ff0000",
        "--lever-angle": "0deg",
      },
      rightSet: {
        "--color-right": "#ffff00",
        "--lever-angle": "40deg",
      },
      leftSetting: {
        "--color-middle": "#ff0000",
        "--lever-angle": "-40deg",
      },
      middleSetting: {
        "--color-middle": "#ff0000",
        "--lever-angle": "0deg",
      },
      rightSetting: {
        "--color-middle": "#ff0000",
        "--lever-angle": "40deg",
      },
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
    },
  },
  departureSignalNoOcp: {
    component: Departure2NOOCP1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
    states: {
      default: {
        "--color-121f1e": "#121f1e",
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-4f4f4f": "#4f4f4f",
        "--color-696969": "#696969",
        "--color-6c6c6f": "#6c6c6f",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe",
        "--color-departure": "#121f1e",
        "--color-shunt": "#696969",
      },
      states: "shuntBlinking shuntActive departureActive departureBlinking",
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
    },
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
    states: {
      default: {
        "--color-121f1e": "#121f1e",
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-4f4f4f": "#4f4f4f",
        "--color-696969": "#696969",
        "--color-6c6c6f": "#6c6c6f",
        "--occupation-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe",
        "--color-departure": "#121f1e",
        "--color-shunt": "#696969",
      },
      states: "shuntBlinking shuntActive occupied reserved shuntActiveOccupied shuntActiveReserved departureActive departureBlinking departureActiveOccupied departureActiveReserved",
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
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
    states: {
      default: {
        "--color-121f1e": "#121f1e",
        "--color-1f1212": "#1f1212",
        "--color-261f10": "#261f10",
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-4f4f4f": "#4f4f4f",
        "--color-696969": "#696969",
        "--color-6c6c6f": "#6c6c6f",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe",
        "--color-departure": "#121f1e",
        "--color-shunt": "#696969",
        "--color-danger": "#1f1212",
        "--color-caution": "#261f10",
      },
      states: "shuntBlinking shuntActive departureActive departureBlinking cautionActive cautionBlinking dangerActive dangerBlinking",
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
    },
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
      default: {
        "--color-121f1e": "#121f1e",
        "--color-1f1212": "#1f1212",
        "--color-261f10": "#261f10",
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-4f4f4f": "#4f4f4f",
        "--color-696969": "#696969",
        "--color-6c6c6f": "#6c6c6f",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe",
        "--color-departure": "#121f1e",
        "--color-shunt": "#696969",
        "--color-danger": "#1f1212",
        "--color-caution": "#261f10",
      },
      states: "shuntBlinking shuntBlinkingOccupied shuntBlinkingReserved shuntActive shuntActiveOccupied shuntActiveReserved shuntReserved shuntOccupied departureActive departureBlinking departureActiveOccupied departureActiveReserved departureBlinkingOccupied departureBlinkingReserved departureReserved departureOccupied cautionActive cautionBlinking cautionActiveOccupied cautionActiveReserved cautionBlinkingOccupied cautionBlinkingReserved cautionReserved cautionOccupied dangerActive dangerBlinking dangerActiveOccupied dangerActiveReserved dangerBlinkingOccupied dangerBlinkingReserved dangerReserved dangerOccupied",
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
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
    states: {
      default: {
        "--color-121f1e": "#121f1e",
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-4f4f4f": "#4f4f4f",
        "--color-6c6c6f": "#6c6c6f",
        "--detail-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--main-color-alt": "#b3b3b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
    },
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
    states: {
      default: {
        "--color-121f1e": "#121f1e",
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-4f4f4f": "#4f4f4f",
        "--color-6c6c6f": "#6c6c6f",
        "--detail-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--main-color-alt": "#b3b3b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
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
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-4f4f4f": "#4f4f4f",
        "--color-696969": "#696969",
        "--color-6c6c6f": "#6c6c6f",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
    },
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
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-4f4f4f": "#4f4f4f",
        "--color-696969": "#696969",
        "--color-6c6c6f": "#6c6c6f",
        "--detail-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
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
    texts: {
      "text": {
        "fill": "#000000",
        "size": "26px",
        "text": "Text"
      }
    },
  },
  shuntSignalButtonBuffer: {
    component: ShuntButtonSignalBUFFER1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-4f4f4f": "#4f4f4f",
        "--color-696969": "#696969",
        "--color-6c6c6f": "#6c6c6f",
        "--detail-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--main-color-alt": "#b3b3b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
    },
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
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "topswitchtext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Top Switch Text"
      },
      "bottomswitchtext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Bottom Switch Text"
      }
    },
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
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--detail-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "topswitchtext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Top Switch Text"
      },
      "bottomswitchtext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Bottom Switch Text"
      }
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
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "bottomswitchtext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Lower Switch Text"
      },
      "topswitchtext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Upper Switch Text"
      }
    },
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
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--detail-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "bottomswitchtext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Lower Switch Text"
      },
      "topswitchtext": {
        "fill": "#000000",
        "size": "10px",
        "text": "Upper Switch Text"
      }
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
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
    },
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
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--detail-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
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
    states: {
      default: {
        "--stripe-color": "#3b3b3b",
        "--bg-color": "#b4bbbd"
      },
    },
  },
  trackSignNoOcp: {
    component: TrackSignNOOCP1Square,
    space: {
      x: 1,
      y: 1,
    },
    usedSpace: [[0, 0]],
    traversable: false,
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
    },
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
    states: {
      default: {
        "--color-27282b": "#27282b",
        "--color-343638": "#343638",
        "--stripe-color": "#3b3b3b",
        "--color-424345": "#424345",
        "--color-6c6c6f": "#6c6c6f",
        "--detail-color": "#6e6e6e",
        "--color-767879": "#767879",
        "--color-7e8083": "#7e8083",
        "--color-898b8e": "#898b8e",
        "--color-8f9395": "#8f9395",
        "--color-95999c": "#95999c",
        "--color-9fa3a6": "#9fa3a6",
        "--color-a5a9ac": "#a5a9ac",
        "--main-color": "#acb0b3",
        "--bg-color": "#b4bbbd",
        "--color-b9bdc0": "#b9bdc0",
        "--color-c5c9cb": "#c5c9cb",
        "--color-cfd3d6": "#cfd3d6",
        "--color-d9d9d9": "#d9d9d9",
        "--color-fdfefe": "#fdfefe"
      },
    },
    texts: {
      "text": {
        "fill": "#000000",
        "size": "10px",
        "text": "Text"
      }
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
    states: {
      default: {
        "--stripe-color": "#3b3b3b",
        "--detail-color": "#6e6e6e",
        "--bg-color": "#b4bbbd"
      },
    },
  },
};