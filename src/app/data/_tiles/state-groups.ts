import type { StateGroupRegistry } from '@/app/components/tiles/tile-catalog';

export const stateGroups: StateGroupRegistry = {
  // Signal aspect group
  signal: {
    label: 'Signal Aspect',
    defaultState: 'default',
    defaultVariant: 'normal',
    states: {
      default: {
        base: {
          // No special signal colors - just the default component appearance
        },
      },
      danger: {
        base: {
          '--color-danger': '#d32f2f',
        },
        variants: {
          blinking: {
            '--color-danger-blink': '#1f1212',
            '--danger-animation': 'danger-blink 1s infinite',
          },
        },
      },
      departure: {
        base: {
          '--color-departure': '#009e49',
        },
        variants: {
          blinking: {
            '--color-departure-blink': '#121f1e',
            '--departure-animation': 'departure-blink 1s infinite',
          },
        },
      },
      caution: {
        base: {
          '--color-caution': '#e69f00',
        },
        variants: {
          blinking: {
            '--color-caution-blink': '#261f10',
            '--caution-animation': 'caution-blink 1s infinite',
          },
        },
      },
      shunt: {
        base: {
          '--color-shunt': '#e2e8f0',
        },
        variants: {
          blinking: {
            '--color-shunt-blink': '#696969',
            '--shunt-animation': 'shunt-blink 1s infinite',
          },
        },
      },
    },
  },

  // Signal button aspect group
  button: {
    label: 'Button',
    defaultState: 'default',
    defaultVariant: 'normal',
    states: {
      default: {
        base: {
          // No special signal colors - just the default component appearance
        },
      },
      departure: {
        base: {
          '--color-departure-button': '#009e49',
        },
        variants: {
          blinking: {
            '--color-departure-button-blink': '#121f1e',
            '--departure-button-animation': 'departure-button-blink 1s infinite',
          },
        },
      },
      shunt: {
        base: {
          '--color-shunt-button': '#e2e8f0',
        },
        variants: {
          blinking: {
            '--color-shunt-button-blink': '#696969',
            '--shunt-button-animation': 'shunt-button-blink 1s infinite',
          },
        },
      },
    },
  },

  // Occupation group
  occupation: {
    label: 'Occupation',
    defaultState: 'default',
    defaultVariant: 'normal',
    states: {
      // 0. Default (Single & Base)
      default: {
        base: {},
      },
      reserved: {
        base: {
          '--occupation-color': '#ffffff',
        },
      },
      occupied: {
        base: {
          '--occupation-color': '#d32f2f',
        },
      },
      setting: {
        base: {
          '--occupation-color': '#d32f2f',
          '--occupation-topRight-color': '#d32f2f',
          '--occupation-topLeft-color': '#d32f2f',
          '--occupation-middleRight-color': '#d32f2f',
          '--occupation-middleLeft-color': '#d32f2f',
          '--occupation-bottomRight-color': '#d32f2f',
          '--occupation-bottomLeft-color': '#d32f2f',
          '--occupation-top-color': '#d32f2f',
          '--occupation-bottom-color': '#d32f2f',
          '--occupation-topC-color': '#d32f2f',
          '--occupation-bottomC-color': '#d32f2f',
        },
        variants: {
          blinking: {
            '--occupation-animation': 'switch-occupation-blink 0.8s ease-in-out infinite',
          },
        },
      },

      // 1. Bottom-Left only
      blTbr: {
        base: {},
        variants: {
          occupied: {
            '--occupation-bottomLeft-color': '#d32f2f',
            '--occupation-bottom-color': '#d32f2f',
          },
          reserved: {
            '--occupation-bottomLeft-color': '#ffffff',
            '--occupation-bottom-color': '#ffffff',
          },
        },
      },

      // 2. Middle-Left and Top-Right
      blTtr: {
        base: {},
        variants: {
          occupied: {
            '--occupation-middleLeft-color': '#d32f2f',
            '--occupation-topRight-color': '#d32f2f',
            '--occupation-bottom-color': '#d32f2f',
            '--occupation-top-color': '#d32f2f',
          },
          reserved: {
            '--occupation-middleLeft-color': '#ffffff',
            '--occupation-topRight-color': '#ffffff',
            '--occupation-bottom-color': '#ffffff',
            '--occupation-top-color': '#ffffff',
          },
          mlOccupiedTrReserved: {
            '--occupation-middleLeft-color': '#d32f2f',
            '--occupation-topRight-color': '#ffffff',
            '--occupation-bottom-color': '#d32f2f',
            '--occupation-top-color': '#ffffff',
          },
          mlReservedTrOccupied: {
            '--occupation-middleLeft-color': '#ffffff',
            '--occupation-topRight-color': '#d32f2f',
            '--occupation-bottom-color': '#ffffff',
            '--occupation-top-color': '#d32f2f',
          },
        },
      },

      // 3. Middle-Left and Middle-Right
      blTmr: {
        base: {},
        variants: {
          occupied: {
            '--occupation-middleLeft-color': '#d32f2f',
            '--occupation-middleRight-color': '#d32f2f',
          },
          reserved: {
            '--occupation-middleLeft-color': '#ffffff',
            '--occupation-middleRight-color': '#ffffff',
          },
          mlOccupiedMrReserved: {
            '--occupation-middleLeft-color': '#d32f2f',
            '--occupation-middleRight-color': '#ffffff',
          },
          mlReservedMrOccupied: {
            '--occupation-middleLeft-color': '#ffffff',
            '--occupation-middleRight-color': '#d32f2f',
          },
        },
      },

      // 4. Bottom only
      b: {
        base: {},
        variants: {
          occupied: {
            '--occupation-bottom-color': '#d32f2f',
            '--occupation-bottomC-color': '#d32f2f',
          },
          reserved: {
            '--occupation-bottom-color': '#ffffff',
            '--occupation-bottomC-color': '#ffffff',
          },
        },
      },

      // 5. Top-Left only
      tlTtr: {
        base: {},
        variants: {
          occupied: { '--occupation-topLeft-color': '#d32f2f' },
          reserved: { '--occupation-topLeft-color': '#ffffff' },
        },
      },

      // 6. Top and Bottom (Top-Left-To-Top-Right And Bottom-Left-To-Bottom-Right)
      tlTtrAblTbr: {
        base: {},
        variants: {
          occupied: {
            '--occupation-topC-color': '#d32f2f',
            '--occupation-bottomC-color': '#d32f2f',
          },
          reserved: {
            '--occupation-topC-color': '#ffffff',
            '--occupation-bottomC-color': '#ffffff',
          },
          topOccupiedBottomReserved: {
            '--occupation-topC-color': '#d32f2f',
            '--occupation-bottomC-color': '#ffffff',
          },
          topReservedBottomOccupied: {
            '--occupation-topC-color': '#ffffff',
            '--occupation-bottomC-color': '#d32f2f',
          },
        },
      },

      // 7. Top only
      t: {
        base: {},
        variants: {
          occupied: { '--occupation-top-color': '#d32f2f', '--occupation-topC-color': '#d32f2f' },
          reserved: { '--occupation-top-color': '#ffffff', '--occupation-topC-color': '#ffffff' },
        },
      },

      // 8. Bottom-Right and Top-Left
      brAtl: {
        base: {},
        variants: {
          occupied: {
            '--occupation-bottomRight-color': '#d32f2f',
            '--occupation-topLeft-color': '#d32f2f',
          },
          reserved: {
            '--occupation-bottomRight-color': '#ffffff',
            '--occupation-topLeft-color': '#ffffff',
          },
          brOccupiedTlReserved: {
            '--occupation-bottomRight-color': '#d32f2f',
            '--occupation-topLeft-color': '#ffffff',
          },
          brReservedTlOccupied: {
            '--occupation-bottomRight-color': '#ffffff',
            '--occupation-topLeft-color': '#d32f2f',
          },
        },
      },
    },
  },

  // Switch group for switch components
  switch: {
    label: 'Switch Position',
    defaultState: 'default',
    defaultVariant: 'normal',
    states: {
      default: {
        base: {
          '--color-left': '#333',
          '--color-middle': '#333',
          '--color-right': '#333',
          '--lever-angle': '0deg',
        },
      },
      leftSet: {
        base: {
          '--color-left': '#009e49',
          '--lever-angle': '-40deg',
        },
      },
      middleSet: {
        base: {
          '--color-middle': '#d32f2f',
          '--lever-angle': '0deg',
        },
      },
      rightSet: {
        base: {
          '--color-right': '#e69f00',
          '--lever-angle': '40deg',
        },
      },
      leftSetting: {
        base: {
          '--color-middle': '#d32f2f',
          '--lever-angle': '-40deg',
        },
      },
      middleSetting: {
        base: {
          '--color-middle': '#d32f2f',
          '--lever-angle': '0deg',
        },
      },
      rightSetting: {
        base: {
          '--color-middle': '#d32f2f',
          '--lever-angle': '40deg',
        },
      },
    },
  },

  // Lineblock group
  lineblock: {
    label: 'Lineblock State',
    defaultState: 'default',
    defaultVariant: 'normal',
    states: {
      default: {
        base: {
          '--color-topleftcircle': '#333',
          '--color-middlecircle': '#333',
          '--color-toprightcircle': '#333',
          '--color-bottomleftcircle': '#333',
          '--color-bottomrightcircle': '#616161',
        },
      },
      sending: {
        base: {
          '--color-topleftcircle': '#009e49',
        },
        variants: {
          blinking: {
            '--color-departure-blink': '#121f1e',
            '--departure-animation': 'departure-blink 1s infinite',
          },
        },
      },
      sendingFree: {
        base: {
          '--color-topleftcircle': '#009e49',
          '--color-middlecircle': '#ffffff',
        },
        variants: {
          blinking: {
            '--color-departure-blink': '#121f1e',
            '--departure-animation': 'departure-blink 1s infinite',
          },
        },
      },
      receiving: {
        base: {
          '--color-toprightcircle': '#d32f2f',
        },
        variants: {
          blinking: {
            '--color-danger-blink': '#1f1212',
            '--danger-animation': 'danger-blink 1s infinite',
          },
        },
      },
      receivingFree: {
        base: {
          '--color-toprightcircle': '#d32f2f',
          '--color-middlecircle': '#ffffff',
        },
        variants: {
          blinking: {
            '--color-danger-blink': '#1f1212',
            '--danger-animation': 'danger-blink 1s infinite',
          },
        },
      },
      receivingConfirmation: {
        base: {
          '--color-toprightcircle': '#d32f2f',
          '--color-bottomleftcircle': '#ffffff',
        },
        variants: {
          blinking: {
            '--color-danger-blink': '#1f1212',
            '--danger-animation': 'danger-blink 1s infinite',
          },
        },
      },
    },
  },

  seal: {
    label: 'Seal',
    defaultState: 'sealed',
    defaultVariant: 'normal',
    states: {
      sealed: {
        base: {
          '--pn-seal-opacity': '1',
          '--color-960000': '#960000',
          '--color-pn-seal': '#424345',
        },
      },
      unsealed: {
        base: {
          '--pn-seal-opacity': '0',
          '--color-960000': 'transparent',
          '--color-pn-seal': 'transparent',
        },
      },
    },
  },
};
