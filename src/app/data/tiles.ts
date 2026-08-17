/*
 * Split tile catalog entrypoint.
 *
 * Keep imports pointing at '@/app/data/tiles'. The actual catalog lives in
 * smaller files under './_tiles' so code and tooling can load just the part
 * they need.
 */

import type { TileCatalog } from '@/app/components/tiles/tile-catalog';
import { boardTiles } from './_tiles/board';
import { buttonTiles } from './_tiles/buttons';
import { signalTiles } from './_tiles/signals';
import { signTiles } from './_tiles/signs';
import { switchTiles } from './_tiles/switches';
import { trackTiles } from './_tiles/tracks';

export { stateGroups } from './_tiles/state-groups';

export const tiles: TileCatalog = {
  ...boardTiles,
  ...buttonTiles,
  ...signalTiles,
  ...signTiles,
  ...switchTiles,
  ...trackTiles,
};

export default tiles;
