import { boardColors, boardColorsDark, boardColorsWithStripe, signalColors } from './shared-styles';

import type { TileCatalog } from '@/app/components/tiles/tile-catalog';

import Track1Square from '@/app/assets/tracks/Track1Square';
import TrackCrossing1Square from '@/app/assets/tracks/TrackCrossing1Square';
import TrackCrossingNOOCP1Square from '@/app/assets/tracks/TrackCrossingNOOCP1Square';
import TrackDiagonalLong6Square from '@/app/assets/tracks/TrackDiagonalLong6Square';
import TrackDiagonalLongNOOCP6Square from '@/app/assets/tracks/TrackDiagonalLongNOOCP6Square';
import TrackNOOCP1Square from '@/app/assets/tracks/TrackNOOCP1Square';
import TrackSign1Square from '@/app/assets/tracks/TrackSign1Square';
import TrackSignNOOCP1Square from '@/app/assets/tracks/TrackSignNOOCP1Square';
import TrackZigZag2Square from '@/app/assets/tracks/TrackZigZag2Square';
import TrackZigZagNOOCP2Square from '@/app/assets/tracks/TrackZigZagNOOCP2Square';

export const trackTiles: TileCatalog = {
  trackDiagonalLongNoOcp: {
    component: TrackDiagonalLongNOOCP6Square,
    space: { x: 2, y: 3 },
    usedSpace: [[0, 0], [0, 1], [1, 1], [1, 2]],
    // Mirroring this mapping yields the normal extended-switch blTtr route.
    traversable: { blTtr: { '2,2': '-1,0', '-1,0': '2,2' } },
    staticStyles: { ...boardColors, '--stripe-color': '#3b3b3b' },
  },

  trackDiagonalLong: {
    component: TrackDiagonalLong6Square,
    space: { x: 2, y: 3 },
    usedSpace: [[0, 0], [0, 1], [1, 1], [1, 2]],
    // Base direction matches a mirrored extended-switch blTtr route.
    traversable: { blTtr: { '2,2': '-1,0', '-1,0': '2,2' } },
    staticStyles: { ...boardColorsDark, ...signalColors, ...boardColorsWithStripe },
    groups: { occupation: { states: ['default', 'reserved', 'occupied'], defaultState: 'default' } },
  },

  trackZigZagNoOcp: {
    component: TrackZigZagNOOCP2Square,
    space: { x: 1, y: 2 },
    usedSpace: [[0, 0], [0, 1]],
    traversable: {
      blTtr: { '-1,1': '1,0', '1,0': '-1,1' },
    },
    staticStyles: { ...boardColors, '--stripe-color': '#3b3b3b' },
  },

  trackZigZag: {
    component: TrackZigZag2Square,
    space: { x: 1, y: 2 },
    usedSpace: [[0, 0], [0, 1]],
    traversable: {
      blTtr: { '-1,1': '1,0', '1,0': '-1,1' },
    },
    staticStyles: { ...boardColorsDark, ...signalColors, ...boardColorsWithStripe },
    groups: { occupation: { states: ['default', 'reserved', 'occupied'], defaultState: 'default' } },
  },

  trackCrossingNoOcp: {
    component: TrackCrossingNOOCP1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: { '1,0': '-1,0', '-1,0': '1,0' },
    },
    staticStyles: { ...boardColors, '--stripe-color': '#3b3b3b' },
  },

  trackCrossing: {
    component: TrackCrossing1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: {
      0: { '1,0': '-1,0', '-1,0': '1,0' },
    },
    staticStyles: { ...boardColorsDark, ...signalColors, ...boardColorsWithStripe },
    groups: { occupation: { states: ['default', 'reserved', 'occupied'], defaultState: 'default' } },
  },

  trackNoOcp: {
    component: TrackNOOCP1Square,
    space: { x: 1, y: 1 },
    usedSpace: [[0, 0]],
    traversable: false,
    staticStyles: {
      ...boardColors,
      '--stripe-color': '#3b3b3b',
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
        fill: '#000000',
        size: '10px',
        text: 'Text',
      },
    },
  },

  trackSign: {
    component: TrackSign1Square,
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
    },
    groups: {
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

  track: {
    component: Track1Square,
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
    },
    groups: {
      occupation: {
        states: ['default', 'reserved', 'occupied'],
        defaultState: 'default',
      },
    },
  },
};
