'use client';
import { useTranslation } from '@/lib/i18n/client';

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
  const t = useTranslation();
  return (
    <div className="authoring-palette flex h-24 shrink-0 flex-wrap content-start gap-1 overflow-y-auto border-b border-[var(--aero-panel-border)] bg-[var(--aero-panel-bg)] p-2">
      {[...tileKeys]
        .sort((a, b) => a.localeCompare(b))
        .map((tileKey) => {
          const tile = tiles[tileKey];
          const previewPiece = createPieceRecord(tileKey, tile, stateGroups);

          return (
            <button
              type="button"
              key={tileKey}
              title={t(tileKey)}
              aria-label={t(tileKey)}
              onClick={() => onSelect(tileKey)}
              className="authoring-tile h-12 w-16 shrink-0 border border-neutral-700 bg-white p-1 text-black"
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
