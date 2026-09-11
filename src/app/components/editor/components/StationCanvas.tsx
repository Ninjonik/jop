'use client';

import TileSvg from '@/app/components/tiles/TileSvg';
import type { StateGroupRegistry, TileData, TileCatalog } from '@/app/components/tiles/tile-catalog';

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

const TRAVERSABLE_PATH_COLORS = ['#0ea5e9', '#f97316', '#a855f7', '#16a34a', '#e11d48'];

function getPathEndpoint(
  coordinate: string,
  space: { x: number; y: number },
  tileSize: number,
) {
  const [tileX, tileY] = coordinate.split(',').map(Number);
  const width = space.x * tileSize;
  const height = space.y * tileSize;

  return {
    x: tileX < 0 ? 0 : tileX >= space.x ? width : (tileX + 0.5) * tileSize,
    y: tileY < 0 ? 0 : tileY >= space.y ? height : (tileY + 0.5) * tileSize,
  };
}

function TraversablePathOverlay({
  pieceId,
  tile,
  tileSize,
  rotation,
  mirrored,
}: {
  pieceId: string;
  tile: TileData;
  tileSize: number;
  rotation: 0 | 180;
  mirrored: boolean;
}) {
  if (!tile.traversable) {
    return null;
  }

  const width = tile.space.x * tileSize;
  const height = tile.space.y * tileSize;
  const transform = [rotation === 180 ? 'rotate(180deg)' : '', mirrored ? 'scaleX(-1)' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      aria-label={`Traversable paths for ${pieceId}`}
      className="pointer-events-none absolute inset-0"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ transform, transformOrigin: 'center' }}
    >
      {Object.entries(tile.traversable).flatMap(([stateName, paths], stateIndex) =>
        Object.entries(paths ?? {}).map(([from, to], pathIndex) => {
          const start = getPathEndpoint(from, tile.space, tileSize);
          const end = getPathEndpoint(to, tile.space, tileSize);
          const color = TRAVERSABLE_PATH_COLORS[stateIndex % TRAVERSABLE_PATH_COLORS.length];
          const labelX = (start.x + end.x) / 2;
          const labelY = (start.y + end.y) / 2;

          return (
            <g key={`${stateName}:${from}:${to}`}>
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={color}
                strokeWidth={3}
                strokeDasharray="5 3"
              />
              <circle cx={start.x} cy={start.y} r={4} fill={color} />
              <circle cx={end.x} cy={end.y} r={4} fill={color} />
              {pathIndex === 0 ? (
                <text
                  x={labelX}
                  y={labelY - 4}
                  fill={color}
                  fontSize={Math.max(9, tileSize * 0.14)}
                  fontWeight="700"
                  textAnchor="middle"
                  stroke="#ffffff"
                  strokeWidth={2}
                  paintOrder="stroke"
                >
                  {stateName}
                </text>
              ) : null}
            </g>
          );
        }),
      )}
    </svg>
  );
}

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
  pendingConnectionPieceId: string | null;
  showTraversablePaths: boolean;
  onContextMenuRotate: () => void;
  onContextMenuMirror: () => void;
  onContextMenuEditText: (textKey: string) => void;
  onContextMenuStartConnection: () => void;
  onContextMenuCancelConnection: () => void;
  onContextMenuConnect: () => void;
  onContextMenuDisconnect: () => void;
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
  pendingConnectionPieceId,
  showTraversablePaths,
  onContextMenuRotate,
  onContextMenuMirror,
  onContextMenuEditText,
  onContextMenuStartConnection,
  onContextMenuCancelConnection,
  onContextMenuConnect,
  onContextMenuDisconnect,
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
              {showTraversablePaths ? (
                <TraversablePathOverlay
                  pieceId={pieceId}
                  tile={tile}
                  tileSize={tileSize}
                  rotation={piece.rotation}
                  mirrored={piece.mirrored}
                />
              ) : null}
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
          pendingConnectionPieceId={pendingConnectionPieceId}
          onRotate={onContextMenuRotate}
          onMirror={onContextMenuMirror}
          onEditText={onContextMenuEditText}
          onStartConnection={onContextMenuStartConnection}
          onCancelConnection={onContextMenuCancelConnection}
          onConnect={onContextMenuConnect}
          onDisconnect={onContextMenuDisconnect}
          onRemove={onContextMenuRemove}
        />
      </div>
    </div>
  );
}
