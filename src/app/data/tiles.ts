/*
 * ============================================================================
 * TILE CATALOG FOR THE RELAY RAILWAY DISPATCHER CONTROLLER
 * ============================================================================
 *
 * All entries in this object are called "components" or "tiles".
 * 1 tile is by default 75x75 px (though this can be scaled up/down via the
 * tileSize prop in the viewer).
 *
 * ----------------------------------------------------------------------------
 * SPACE & COORDINATES
 * ----------------------------------------------------------------------------
 *
 * The `space` property defines the dimensions of the component in tiles.
 * Example: { x: 1, y: 1 } for a 1x1 tile component.
 *
 * Coordinates use the following system:
 *   - 0,0 is the top-left corner
 *   - x increases to the right
 *   - y increases downward
 *
 * The `usedSpace` property tells us which tiles the component actually occupies
 * within its defined space. This is an array of [x, y] coordinate pairs.
 * Example: [[0, 0], [1, 0]] means the component occupies tiles at (0,0) and (1,0).
 *
 * ----------------------------------------------------------------------------
 * TRAVERSABLE STATES
 * ----------------------------------------------------------------------------
 *
 * `traversable` is either `false` (component is not traversable) or an object
 * indexed by numbers 0 ... n representing all possible traversable states.
 *
 * Each state maps "from" coordinates to "to" coordinates, defining how the
 * component connects to neighboring tiles. Out-of-bounds coordinates indicate
 * connections to adjacent tiles outside the component's space.
 *
 * Example:
 *   traversable: {
 *     0: {                    // State 0: both switches off
 *       "1,0": "-1,0",       // From (1,0) go to (-1,0)
 *       "-1,0": "1,0",       // From (-1,0) go to (1,0)
 *     },
 *     1: {                    // State 1: both switches on
 *       "-1,1": "1,0",       // From (-1,1) go to (1,0)
 *       "1,0": "-1,1",       // From (1,0) go to (-1,1)
 *     },
 *   }
 *
 * ----------------------------------------------------------------------------
 * GLOBAL STATE GROUPS
 * ----------------------------------------------------------------------------
 *
 * All states are defined globally in the `stateGroups` object at the top of
 * this file. Each state group represents a category of related states:
 *
 *   - "signal":    Signal aspects (default, danger, departure, caution, shunt)
 *   - "occupation": Track occupation (default, reserved, occupied)
 *   - "switch":    Switch positions (default, leftSet, middleSet, rightSet, etc.)
 *   - "lineblock": Lineblock states (default, sending, receiving, etc.)
 *
 * ----------------------------------------------------------------------------
 * STATE GROUP STRUCTURE
 * ----------------------------------------------------------------------------
 *
 * Each group has the following structure:
 *
 *   groupName: {
 *     label: "Human-readable label for UI",
 *     defaultState: "default",      // The state selected by default
 *     defaultVariant: "normal",     // The variant selected by default
 *     states: {
 *       "default": {
 *         base: { /* CSS custom properties for the default state * / },
 *       },
 *       "stateName": {
 *         base: { /* CSS custom properties for this state * / },
 *         variants: {               // Optional variants (e.g., "blinking")
 *           "variantName": {
 *             "--css-prop": "value",
 *           },
 *         },
 *       },
 *     },
 *   },
 *
 * ----------------------------------------------------------------------------
 * CSS CUSTOM PROPERTIES
 * ----------------------------------------------------------------------------
 *
 * States define CSS custom properties (variables) that are applied to the
 * component's SVG. These variables are then used by the SVG components to
 * control colors, animations, and other visual properties.
 *
 * Common CSS custom properties used across components:
 *   --color-danger:     Red color for danger signals
 *   --color-departure:  Green color for departure signals
 *   --color-caution:    Yellow color for caution signals
 *   --color-shunt:      White/gray color for shunt signals
 *   --occupation-color: Color indicating track occupation (red = occupied, white = reserved)
 *   --lever-angle:      Rotation angle for switch levers
 *   --color-left:       Color for left switch position
 *   --color-middle:     Color for middle switch position
 *   --color-right:      Color for right switch position
 *
 * ----------------------------------------------------------------------------
 * HOW COMPONENTS USE GROUPS
 * ----------------------------------------------------------------------------
 *
 * Components reference global groups via the `groups` property:
 *
 *   groups: {
 *     "signal": {
 *       states: ["default", "departure", "shunt"],  // Which states this component supports
 *       defaultState: "default",                    // Optional: override the group default
 *     },
 *     "occupation": {
 *       states: ["default", "reserved", "occupied"],
 *       defaultState: "default",
 *     },
 *   }
 *
 * The viewer will display a dropdown for each group, allowing you to
 * independently select the state for each group. The selected states are
 * combined to produce the final visual appearance.
 *
 * ----------------------------------------------------------------------------
 * STATIC STYLES
 * ----------------------------------------------------------------------------
 *
 * Components can also have `staticStyles` - CSS custom properties that are
 * always applied regardless of the selected state. This is useful for
 * component-specific colors that don't change with state.
 *
 * Example:
 *   staticStyles: {
 *     "--bg-color": "#b4bbbd",
 *     "--main-color": "#acb0b3",
 *   },
 *
 * ----------------------------------------------------------------------------
 * TEXT ELEMENTS
 * ----------------------------------------------------------------------------
 *
 * Components can define text elements via the `texts` property. Each text
 * element has a fill color, size, and default text content.
 *
 * Example:
 *   texts: {
 *     "text": {
 *       fill: "#000000",
 *       size: "10px",
 *       text: "Text",
 *     },
 *   },
 *
 * The viewer allows you to override the text content, color, and size for
 * each text element.
 *
 * ----------------------------------------------------------------------------
 * ADDING NEW STATE GROUPS
 * ----------------------------------------------------------------------------
 *
 * To add a new state group:
 *
 * 1. Add the group definition to `stateGroups`:
 *
 *    myNewGroup: {
 *      label: "My New Group",
 *      defaultState: "default",
 *      defaultVariant: "normal",
 *      states: {
 *        default: { base: {} },
 *        state1: { base: { "--my-prop": "#d32f2f" } },
 *        state2: { base: { "--my-prop": "#009e49" } },
 *      },
 *    },
 *
 * 2. Add the group to components that support it:
 *
 *    groups: {
 *      myNewGroup: {
 *        states: ["default", "state1", "state2"],
 *        defaultState: "default",
 *      },
 *    }
 *
 * ----------------------------------------------------------------------------
 * VARIANTS (e.g., Blinking)
 * ----------------------------------------------------------------------------
 *
 * States can have variants that extend or override the base properties.
 * The most common variant is "blinking" for signal states.
 *
 * Example:
 *   departure: {
 *     base: { "--color-departure": "#009e49" },
 *     variants: {
 *       blinking: {
 *         "--color-departure-blink": "#121f1e",
 *         "--departure-animation": "departure-blink 1s infinite",
 *       },
 *     },
 *   },
 *
 * When "blinking" is selected, the component gets both the base properties
 * AND the blinking variant properties (merged, with variant taking precedence).
 *
 * ============================================================================
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

// ============================================================================
// GLOBAL STATE GROUPS
// ============================================================================

export const stateGroups: any = {
  // Signal aspect group
  signal: {
    label: "Signal Aspect",
    defaultState: "default",
    defaultVariant: "normal",
    states: {
      default: {
        base: {
          // No special signal colors - just the default component appearance
        },
      },
      danger: {
        base: {
          "--color-danger": "#d32f2f",
        },
        variants: {
          blinking: {
            "--color-danger-blink": "#1f1212",
            "--danger-animation": "danger-blink 1s infinite",
          },
        },
      },
      departure: {
        base: {
          "--color-departure": "#009e49",
        },
        variants: {
          blinking: {
            "--color-departure-blink": "#121f1e",
            "--departure-animation": "departure-blink 1s infinite",
          },
        },
      },
      caution: {
        base: {
          "--color-caution": "#e69f00",
        },
        variants: {
          blinking: {
            "--color-caution-blink": "#261f10",
            "--caution-animation": "caution-blink 1s infinite",
          },
        },
      },
      shunt: {
        base: {
          "--color-shunt": "#e2e8f0",
        },
        variants: {
          blinking: {
            "--color-shunt-blink": "#696969",
            "--shunt-animation": "shunt-blink 1s infinite",
          },
        },
      },
    },
  },

  // Occupation group
  occupation: {
    label: "Occupation",
    defaultState: "default",
    defaultVariant: "normal",
    states: {
      default: {
        base: {},
      },
      reserved: {
        base: {
          "--occupation-color": "#ffffff",
        },
      },
      occupied: {
        base: {
          "--occupation-color": "#d32f2f",
        },
      },
    },
  },

  // Switch group for switch components
  switch: {
    label: "Switch Position",
    defaultState: "default",
    defaultVariant: "normal",
    states: {
      default: {
        base: {
          "--color-left": "#333",
          "--color-middle": "#333",
          "--color-right": "#333",
          "--lever-angle": "0deg",
        },
      },
      leftSet: {
        base: {
          "--color-left": "#009e49",
          "--lever-angle": "-40deg",
        },
      },
      middleSet: {
        base: {
          "--color-middle": "#d32f2f",
          "--lever-angle": "0deg",
        },
      },
      rightSet: {
        base: {
          "--color-right": "#e69f00",
          "--lever-angle": "40deg",
        },
      },
      leftSetting: {
        base: {
          "--color-middle": "#d32f2f",
          "--lever-angle": "-40deg",
        },
      },
      middleSetting: {
        base: {
          "--color-middle": "#d32f2f",
          "--lever-angle": "0deg",
        },
      },
      rightSetting: {
        base: {
          "--color-middle": "#d32f2f",
          "--lever-angle": "40deg",
        },
      },
    },
  },

  // Lineblock group
  lineblock: {
    label: "Lineblock State",
    defaultState: "default",
    defaultVariant: "normal",
    states: {
      default: {
        base: {
          "--color-topleftcircle": "#333",
          "--color-middlecircle": "#333",
          "--color-toprightcircle": "#333",
          "--color-bottomleftcircle": "#333",
          "--color-bottomrightcircle": "#616161",
        },
      },
      sending: {
        base: {
          "--color-topleftcircle": "#009e49",
        },
        variants: {
          blinking: {
            "--color-departure-blink": "#121f1e",
            "--departure-animation": "departure-blink 1s infinite",
          },
        },
      },
      sendingFree: {
        base: {
          "--color-topleftcircle": "#009e49",
          "--color-middlecircle": "#ffffff",
        },
        variants: {
          blinking: {
            "--color-departure-blink": "#121f1e",
            "--departure-animation": "departure-blink 1s infinite",
          },
        },
      },
      receiving: {
        base: {
          "--color-toprightcircle": "#d32f2f",
        },
        variants: {
          blinking: {
            "--color-danger-blink": "#1f1212",
            "--danger-animation": "danger-blink 1s infinite",
          },
        },
      },
      receivingFree: {
        base: {
          "--color-toprightcircle": "#d32f2f",
          "--color-middlecircle": "#ffffff",
        },
        variants: {
          blinking: {
            "--color-danger-blink": "#1f1212",
            "--danger-animation": "danger-blink 1s infinite",
          },
        },
      },
      receivingConfirmation: {
        base: {
          "--color-toprightcircle": "#d32f2f",
          "--color-bottomleftcircle": "#ffffff",
        },
        variants: {
          blinking: {
            "--color-danger-blink": "#1f1212",
            "--danger-animation": "danger-blink 1s infinite",
          },
        },
      },
    },
  },
};

// ============================================================================
// COMMON STATIC STYLES
// ============================================================================

// Common board/background colors
const boardColors = {
  "--bg-color": "#b4bbbd",
  "--main-color": "#acb0b3",
};

const boardColorsDark = {
  "--bg-color": "#b4bbbd",
  "--main-color": "#acb0b3",
  "--color-27282b": "#27282b",
  "--color-343638": "#343638",
  "--color-424345": "#424345",
  "--color-6c6c6f": "#6c6c6f",
  "--color-767879": "#767879",
  "--color-7e8083": "#7e8083",
  "--color-898b8e": "#898b8e",
  "--color-8f9395": "#8f9395",
  "--color-95999c": "#95999c",
  "--color-9fa3a6": "#9fa3a6",
  "--color-a5a9ac": "#a5a9ac",
  "--color-b9bdc0": "#b9bdc0",
  "--color-c5c9cb": "#c5c9cb",
  "--color-cfd3d6": "#cfd3d6",
  "--color-d9d9d9": "#d9d9d9",
  "--color-fdfefe": "#fdfefe",
};

const boardColorsWithStripe = {
  ...boardColorsDark,
  "--stripe-color": "#3b3b3b",
  "--detail-color": "#6e6e6e",
  "--main-color-alt": "#b3b3b3",
};

const signalColors = {
  "--color-departure": "#121f1e",
  "--color-shunt": "#696969",
  "--color-danger": "#1f1212",
  "--color-caution": "#261f10",
  "--color-121f1e": "#121f1e",
  "--color-1f1212": "#1f1212",
  "--color-261f10": "#261f10",
  "--color-4f4f4f": "#4f4f4f",
};

// ============================================================================
// TILE CATALOG
// ============================================================================

export const tiles: any = {
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
      "--color-fdfefe": "#fdfefe",
    },
  },

  departureButton: {
    component: DepartureButton1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsWithStripe,
      "--color-shunt": "#696969",
      "--color-departure": "#121f1e",
    },
    groups: {
      signal: {
        states: ["default", "departure", "shunt"],
        defaultState: "default",
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
      "--color-1a1a1a": "#1a1a1a",
      "--color-333": "#333",
      "--color-616161": "#616161",
      "--color-828282": "#828282",
      "--color-949494": "#949494",
      "--detail-color": "#6e6e6e",
      "--main-color-alt": "#b3b3b3",
    },
    groups: {
      lineblock: {
        states: [
          "default",
          "sending",
          "sendingFree",
          "receiving",
          "receivingFree",
          "receivingConfirmation",
        ],
        defaultState: "default",
      },
    },
    texts: {
      bottomlefttext: {
        fill: "#000000",
        size: "10px",
        text: "Bottom Left Text",
      },
      toplefttext: {
        fill: "#000000",
        size: "10px",
        text: "Top Left Text",
      },
      middletext: {
        fill: "#000000",
        size: "10px",
        text: "Middle Text",
      },
      toprighttext: {
        fill: "#000000",
        size: "10px",
        text: "Top Right Text",
      },
      bottomrighttext: {
        fill: "#000000",
        size: "10px",
        text: "Bottom Right",
      },
    },
  },

  shuntButtonNoOcp: {
    component: ShuntButtonNOOCP1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsWithStripe,
      "--color-696969": "#696969",
    },
    groups: {
      signal: {
        states: ["default", "shunt"],
        defaultState: "default",
      },
    },
  },

  shuntButton: {
    component: ShuntButton1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        "1,0": "-1,0",
        "-1,0": "1,0",
      },
    },
    staticStyles: {
      ...boardColorsWithStripe,
      "--occupation-color": "#6e6e6e",
      "--main-color": "#acb0b3",
    },
    groups: {
      signal: {
        states: ["default", "shunt"],
        defaultState: "default",
      },
      occupation: {
        states: ["default", "reserved", "occupied"],
        defaultState: "default",
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
      "--color-333": "#333",
      "--detail-color": "#6e6e6e",
      "--main-color-alt": "#b3b3b3",
    },
    groups: {
      signal: {
        states: ["default", "shunt"],
        defaultState: "default",
      },
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
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
      "--color-1f1f1f": "#1f1f1f",
      "--color-242424": "#242424",
      "--color-383838": "#383838",
      "--color-949494": "#949494",
      "--color-960000": "#960000",
      "--color-c2c2c2": "#c2c2c2",
    },
    texts: {
      digit6: {
        fill: "#D3D3D3",
        size: "6px",
        text: "0",
      },
      digit5: {
        fill: "#D3D3D3",
        size: "6px",
        text: "0",
      },
      digit4: {
        fill: "#D3D3D3",
        size: "6px",
        text: "0",
      },
      digit3: {
        fill: "#D3D3D3",
        size: "6px",
        text: "0",
      },
      digit2: {
        fill: "#D3D3D3",
        size: "6px",
        text: "0",
      },
      digit1: {
        fill: "#D3D3D3",
        size: "6px",
        text: "0",
      },
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
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
      "--color-949494": "#949494",
      "--color-c2c2c2": "#c2c2c2",
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
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
      "--color-333": "#333",
      "--color-left": "#333",
      "--color-middle": "#333",
      "--color-right": "#333",
      "--color-a1a1a1": "#a1a1a1",
      "--lever-angle": "0deg",
    },
    groups: {
      switch: {
        states: [
          "default",
          "leftSet",
          "middleSet",
          "rightSet",
          "leftSetting",
          "middleSetting",
          "rightSetting",
        ],
        defaultState: "default",
      },
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
      },
    },
  },

  departureSignalNoOcp: {
    component: Departure2NOOCP1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      ...signalColors,
      ...boardColorsWithStripe,
      "--color-121f1e": "#121f1e",
      "--color-4f4f4f": "#4f4f4f",
      "--color-696969": "#696969",
      "--color-departure": "#121f1e",
      "--color-shunt": "#696969",
    },
    groups: {
      signal: {
        states: ["default", "departure", "shunt"],
        defaultState: "default",
      },
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
      },
    },
  },

  departureSignal: {
    component: Departure21Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        "1,0": "-1,0",
        "-1,0": "1,0",
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...signalColors,
      ...boardColorsWithStripe,
      "--color-121f1e": "#121f1e",
      "--color-4f4f4f": "#4f4f4f",
      "--color-696969": "#696969",
      "--occupation-color": "#6e6e6e",
      "--color-departure": "#121f1e",
      "--color-shunt": "#696969",
    },
    groups: {
      signal: {
        states: ["default", "departure", "shunt"],
        defaultState: "default",
      },
      occupation: {
        states: ["default", "reserved", "occupied"],
        defaultState: "default",
      },
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
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
      "--color-121f1e": "#121f1e",
      "--color-1f1212": "#1f1212",
      "--color-261f10": "#261f10",
      "--color-4f4f4f": "#4f4f4f",
      "--color-696969": "#696969",
      "--color-departure": "#121f1e",
      "--color-shunt": "#696969",
      "--color-danger": "#1f1212",
      "--color-caution": "#261f10",
    },
    groups: {
      signal: {
        states: ["default", "danger", "departure", "caution", "shunt"],
        defaultState: "default",
      },
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
      },
    },
  },

  entrySignal: {
    component: Entry1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        "1,0": "-1,0",
        "-1,0": "1,0",
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...signalColors,
      ...boardColorsWithStripe,
      "--color-121f1e": "#121f1e",
      "--color-1f1212": "#1f1212",
      "--color-261f10": "#261f10",
      "--color-4f4f4f": "#4f4f4f",
      "--color-696969": "#696969",
      "--color-departure": "#121f1e",
      "--color-shunt": "#696969",
      "--color-danger": "#1f1212",
      "--color-caution": "#261f10",
    },
    groups: {
      signal: {
        states: ["default", "danger", "departure", "caution", "shunt"],
        defaultState: "default",
      },
      occupation: {
        states: ["default", "reserved", "occupied"],
        defaultState: "default",
      },
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
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
      "--color-departure": "#121f1e",
      "--color-4f4f4f": "#4f4f4f",
    },
    groups: {
      signal: {
        states: ["default", "departure"],
        defaultState: "default",
      },
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
      },
    },
  },

  premainSignal: {
    component: Premain1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        "1,0": "-1,0",
        "-1,0": "1,0",
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
      "--color-departure": "#121f1e",
      "--color-4f4f4f": "#4f4f4f",
      "--occupation-color": "#6e6e6e",
    },
    groups: {
      signal: {
        states: ["default", "departure"],
        defaultState: "default",
      },
      occupation: {
        states: ["default", "reserved", "occupied"],
        defaultState: "default",
      },
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
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
      "--color-4f4f4f": "#4f4f4f",
      "--color-696969": "#696969",
    },
    groups: {
      signal: {
        states: ["default", "shunt"],
        defaultState: "default",
      },
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
      },
    },
  },

  shuntSignal: {
    component: Shunt1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        "1,0": "-1,0",
        "-1,0": "1,0",
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
      "--color-4f4f4f": "#4f4f4f",
      "--color-696969": "#696969",
      "--occupation-color": "#6e6e6e",
    },
    groups: {
      signal: {
        states: ["default", "shunt"],
        defaultState: "default",
      },
      occupation: {
        states: ["default", "reserved", "occupied"],
        defaultState: "default",
      },
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
      },
    },
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
        fill: "#000000",
        size: "26px",
        text: "Text",
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
      "--color-4f4f4f": "#4f4f4f",
      "--color-696969": "#696969",
    },
    groups: {
      signal: {
        states: ["default", "shunt"],
        defaultState: "default",
      },
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
      },
    },
  },

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
        fill: "#000000",
        size: "10px",
        text: "Top Switch Text",
      },
      bottomswitchtext: {
        fill: "#000000",
        size: "10px",
        text: "Bottom Switch Text",
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
      0: {
        "1,0": "-1,0",
        "-1,0": "1,0",
        "1,1": "-1,1",
        "-1,1": "1,1",
      },
      1: {
        "-1,1": "1,0",
        "1,0": "-1,1",
      },
      2: {
        "1,1": "-1,1",
        "-1,1": "1,1",
      },
      3: {
        "1,0": "-1,0",
        "-1,0": "1,0",
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
    },
    texts: {
      topswitchtext: {
        fill: "#000000",
        size: "10px",
        text: "Top Switch Text",
      },
      bottomswitchtext: {
        fill: "#000000",
        size: "10px",
        text: "Bottom Switch Text",
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
        fill: "#000000",
        size: "10px",
        text: "Lower Switch Text",
      },
      topswitchtext: {
        fill: "#000000",
        size: "10px",
        text: "Upper Switch Text",
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
      0: {
        "-1,2": "1,2",
        "1,2": "-1,2",
      },
      1: {
        "-1,2": "2,0",
        "2,0": "-1,2",
      },
      2: {
        "-1,2": "1,2",
        "1,2": "-1,2",
      },
      3: {
        "-1,2": "2,1",
        "2,1": "-1,2",
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
    },
    texts: {
      bottomswitchtext: {
        fill: "#000000",
        size: "10px",
        text: "Lower Switch Text",
      },
      topswitchtext: {
        fill: "#000000",
        size: "10px",
        text: "Upper Switch Text",
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
        fill: "#000000",
        size: "10px",
        text: "Text",
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
      0: {
        "-1,1": "1,1",
        "1,1": "-1,1",
      },
      1: {
        "-1,1": "1,0",
        "1,0": "-1,1",
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
      },
    },
  },

  trackNoOcp: {
    component: TrackNOOCP1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColors,
      "--stripe-color": "#3b3b3b",
    },
  },

  trackSignNoOcp: {
    component: TrackSignNOOCP1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
      },
    },
  },

  trackSign: {
    component: TrackSign1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        "1,0": "-1,0",
        "-1,0": "1,0",
      },
    },
    staticStyles: {
      ...boardColorsDark,
      ...boardColorsWithStripe,
    },
    texts: {
      text: {
        fill: "#000000",
        size: "10px",
        text: "Text",
      },
    },
  },

  track: {
    component: Track1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: {
        "1,0": "-1,0",
        "-1,0": "1,0",
      },
    },
    staticStyles: {
      ...boardColors,
      "--stripe-color": "#3b3b3b",
      "--detail-color": "#6e6e6e",
    },
  },
};

// Default export for compatibility
export default tiles;
