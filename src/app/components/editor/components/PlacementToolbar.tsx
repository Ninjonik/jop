'use client';

import TileSvg from '@/app/components/tiles/TileSvg';
import type { StateGroupRegistry, TileCatalog } from '@/app/components/tiles/tile-catalog';
import { createPieceRecord } from '@/lib/station/layout';

interface Props {
  tileKeys: string[];
  tiles: TileCatalog;
  stateGroups: StateGroupRegistry;
  onSelect: (tileKey: string) => void;
}

export default function PlacementToolbar({ tileKeys, tiles, stateGroups, onSelect }: Props) {
  return (
    <div className="mb-2 flex h-20 flex-wrap content-start gap-1 overflow-y-auto">
      {[...tileKeys].sort((a, b) => a.localeCompare(b)).map((tileKey) => {
        const tile = tiles[tileKey];
        const previewPiece = createPieceRecord(tileKey, tile, stateGroups);

        return (
          <button
            type="button"
            key={tileKey}
            title={tileKey}
            aria-label={tileKey}
            onClick={() => onSelect(tileKey)}
            className="h-12 w-16 shrink-0 border border-neutral-700 bg-white p-1 text-black"
          >
            <TileSvg
              tileKey={tileKey}
              tile={tile}
              stateGroups={stateGroups}
              selections={previewPiece.state.groups}
              textValues={previewPiece.state.texts}
              className="h-full w-full object-contain"
            />
          </button>
        );
      })}
    </div>
  );
}
