'use client';

import TileSvg from '@/app/components/tiles/TileSvg';
import type { StateGroupRegistry, TileCatalog } from '@/app/components/tiles/tile-catalog';

import { FILLER_TILE_KEY } from '../constants';
import type {
  EditorState,
  PieceContextMenuState,
  PlacementVariant,
  PendingPlacementPosition,
} from '../types';
import { getRenderablePieces, parseCellRef } from '../utils';
import PieceContextMenu from './PieceContextMenu';
import PlacementVariantPicker from './PlacementVariantPicker';

interface Props {
  editorState: EditorState;
  tiles: TileCatalog;
  stateGroups: StateGroupRegistry;
  tileSize: number;
  selectedCells: [number, number][];
  pendingVariants: PlacementVariant[];
  pendingPosition: PendingPlacementPosition | null;
  onTileClick: (x: number, y: number, event: React.MouseEvent<HTMLButtonElement>) => void;
  onTileContextMenu: (x: number, y: number, event: React.MouseEvent<HTMLButtonElement>) => void;
  onVariantPick: (variant: PlacementVariant) => void;
  contextMenu: PieceContextMenuState | null;
  onContextMenuRotate: () => void;
  onContextMenuMirror: () => void;
  onContextMenuEditText: (textKey: string) => void;
  onContextMenuRemove: () => void;
}

export default function StationCanvas({
  editorState,
  tiles,
  stateGroups,
  tileSize,
  selectedCells,
  pendingVariants,
  pendingPosition,
  onTileClick,
  onTileContextMenu,
  onVariantPick,
  contextMenu,
  onContextMenuRotate,
  onContextMenuMirror,
  onContextMenuEditText,
  onContextMenuRemove,
}: Props) {
  const renderablePieces = getRenderablePieces(editorState);

  return (
    <div
      className="relative flex flex-1 items-start justify-center overflow-auto bg-neutral-400"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="relative shrink-0 bg-neutral-500"
        style={{
          width: editorState.width * tileSize,
          height: editorState.height * tileSize,
          marginTop: 'auto',
          marginBottom: 'auto',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(0,0,0,0.2) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.2) 1px, transparent 1px)',
            backgroundSize: `${tileSize}px ${tileSize}px`,
          }}
        />

        {renderablePieces.map(({ pieceId, anchorX, anchorY }) => {
          const piece = editorState.pieces[pieceId];
          const tile = tiles[piece.type];

          return (
            <div
              key={pieceId}
              className="pointer-events-none absolute"
              style={{
                left: anchorX * tileSize,
                top: anchorY * tileSize,
                width: tile.space.x * tileSize,
                height: tile.space.y * tileSize,
              }}
            >
              <TileSvg
                tileKey={piece.type}
                tile={tile}
                stateGroups={stateGroups}
                selections={piece.state.groups}
                textValues={piece.state.texts}
                orientation={{
                  rotation: piece.rotation,
                  mirrored: piece.mirrored,
                }}
                className="h-full w-full object-contain"
              />
            </div>
          );
        })}

        {editorState.map.map((row, y) =>
          row.map((value, x) => {
            const selected = selectedCells.some(([sx, sy]) => sx === x && sy === y);
            const { pieceId } = parseCellRef(value);
            const filler = editorState.pieces[pieceId]?.type === FILLER_TILE_KEY;

            return (
              <button
                type="button"
                key={`${x}-${y}`}
                onClick={(event) => onTileClick(x, y, event)}
                onContextMenu={(event) => onTileContextMenu(x, y, event)}
                className={`absolute border ${selected ? 'border-sky-500 bg-sky-400/30' : 'border-transparent'} ${filler ? '' : 'cursor-not-allowed'}`}
                style={{
                  left: x * tileSize,
                  top: y * tileSize,
                  width: tileSize,
                  height: tileSize,
                }}
              />
            );
          })
        )}

        <PlacementVariantPicker
          variants={pendingVariants}
          position={pendingPosition}
          tileSize={tileSize}
          onPick={onVariantPick}
        />
        <PieceContextMenu
          contextMenu={contextMenu}
          onRotate={onContextMenuRotate}
          onMirror={onContextMenuMirror}
          onEditText={onContextMenuEditText}
          onRemove={onContextMenuRemove}
        />
      </div>
    </div>
  );
}
