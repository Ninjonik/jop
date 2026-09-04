import { boardColors, boardColorsDark, boardColorsWithStripe, signalColors } from './shared-styles';

import type { TileCatalog } from '@/app/components/tiles/tile-catalog';

import Track1Square from '@/app/assets/tracks/Track1Square';
import TrackCrossing1Square from '@/app/assets/tracks/TrackCrossing1Square';
import TrackCrossingNOOCP1Square from '@/app/assets/tracks/TrackCrossingNOOCP1Square';
import TrackNOOCP1Square from '@/app/assets/tracks/TrackNOOCP1Square';
import TrackSign1Square from '@/app/assets/tracks/TrackSign1Square';
import TrackSignNOOCP1Square from '@/app/assets/tracks/TrackSignNOOCP1Square';

export const trackTiles: TileCatalog = {
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
