import type { PieceOrientation, StateGroupRegistry, TileCatalog, TileData } from '@/app/components/tiles/tile-catalog';
import { getDefaultTextValues, getInitialGroupSelections } from '@/app/components/tiles/tile-rendering';

import { FILLER_TILE_KEY } from './constants';
import type { EditorState, GridCellRef, PieceRecord, PlacementVariant } from './types';

const SWITCH_TILE_KEYS = new Set([
  'crossoverSwitchNoOcp',
  'crossoverSwitch',
  'extendedSwitchNoOcp',
  'extendedSwitch',
  'singleSwitchNoOcp',
  'singleSwitch',
]);

const SWITCH_BUTTON_TILE_KEYS = new Set(['switchButton']);

export function createId() {
  return Math.random().toString(36).slice(2, 12);
}

export function toCellKey(x: number, y: number) {
  return `${x},${y}`;
}

export function parseCellRef(value: string) {
  const lastDot = value.lastIndexOf('.');
  return {
    pieceId: value.slice(0, lastDot),
    part: Number(value.slice(lastDot + 1)),
  };
}

export function sortCells(cells: [number, number][]) {
  return [...cells].sort(([ax, ay], [bx, by]) => (ay - by === 0 ? ax - bx : ay - by));
}

export function getSelectionSignature(cells: [number, number][]) {
  const minX = Math.min(...cells.map(([x]) => x));
  const minY = Math.min(...cells.map(([, y]) => y));

  return sortCells(cells)
    .map(([x, y]) => `${x - minX},${y - minY}`)
    .join('|');
}

function getTransformedPoint(
  x: number,
  y: number,
  space: { x: number; y: number },
  orientation: PieceOrientation
): [number, number] {
  let nextX = x;
  let nextY = y;

  if (orientation.mirrored) {
    nextX = space.x - 1 - nextX;
  }

  if (orientation.rotation === 180) {
    nextX = space.x - 1 - nextX;
    nextY = space.y - 1 - nextY;
  }

  return [nextX, nextY];
}

function normalizeUsedSpace(points: [number, number][]) {
  const minX = Math.min(...points.map(([x]) => x));
  const minY = Math.min(...points.map(([, y]) => y));

  return points.map(([x, y]) => [x - minX, y - minY] as [number, number]);
}

export function buildPlacementVariants(tiles: TileCatalog) {
  const variants: PlacementVariant[] = [];
  const seen = new Set<string>();
  const orientations: PieceOrientation[] = [
    { rotation: 0, mirrored: false },
    { rotation: 180, mirrored: false },
    { rotation: 0, mirrored: true },
    { rotation: 180, mirrored: true },
  ];

  Object.entries(tiles).forEach(([tileKey, tile]) => {
    orientations.forEach((orientation) => {
      const normalized = normalizeUsedSpace(
        tile.usedSpace.map(([x, y]) => getTransformedPoint(x, y, tile.space, orientation))
      );
      const signature = sortCells(normalized)
        .map(([x, y]) => `${x},${y}`)
        .join('|');
      const dedupeKey = `${tileKey}:${signature}`;

      if (seen.has(dedupeKey)) {
        return;
      }

      seen.add(dedupeKey);

      variants.push({
        tileKey,
        orientation,
        usedSpace: normalized,
        partsByKey: Object.fromEntries(normalized.map(([x, y], index) => [toCellKey(x, y), index])),
      });
    });
  });

  return variants;
}

export function canPieceUseInPlaceOrientation(tile: TileData) {
  const orientations: PieceOrientation[] = [
    { rotation: 0, mirrored: false },
    { rotation: 180, mirrored: false },
    { rotation: 0, mirrored: true },
    { rotation: 180, mirrored: true },
  ];

  const signatures = new Set(
    orientations.map((orientation) =>
      sortCells(
        normalizeUsedSpace(
          tile.usedSpace.map(([x, y]) => getTransformedPoint(x, y, tile.space, orientation))
        )
      )
        .map(([x, y]) => `${x},${y}`)
        .join('|')
    )
  );

  return signatures.size === 1;
}

export function createPieceRecord(
  tileKey: string,
  tile: TileData,
  stateGroups: StateGroupRegistry
): PieceRecord {
  return {
    type: tileKey,
    rotation: 0,
    mirrored: false,
    state: {
      groups: getInitialGroupSelections(tile, stateGroups),
      texts: getDefaultTextValues(tile),
    },
  };
}

export function createInitialEditorState(
  width: number,
  height: number,
  tiles: TileCatalog,
  stateGroups: StateGroupRegistry
): EditorState {
  const pieces: Record<string, PieceRecord> = {};
  const map: GridCellRef[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => '' as GridCellRef)
  );
  const fillerTile = tiles[FILLER_TILE_KEY];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pieceId = createId();
      pieces[pieceId] = createPieceRecord(FILLER_TILE_KEY, fillerTile, stateGroups);
      map[y][x] = `${pieceId}.0`;
    }
  }

  return { width, height, pieces, map, connections: {} };
}

export function getRenderablePieces(editorState: EditorState) {
  const refs = new Map<string, { cells: [number, number][] }>();

  editorState.map.forEach((row, y) => {
    row.forEach((value, x) => {
      const { pieceId } = parseCellRef(value);
      const entry = refs.get(pieceId) ?? { cells: [] };
      entry.cells.push([x, y]);
      refs.set(pieceId, entry);
    });
  });

  return Array.from(refs.entries()).map(([pieceId, entry]) => ({
    pieceId,
    anchorX: Math.min(...entry.cells.map(([x]) => x)),
    anchorY: Math.min(...entry.cells.map(([, y]) => y)),
  }));
}

export function getAllowedPlacements(
  editorState: EditorState,
  selectedCells: [number, number][],
  placementVariants: PlacementVariant[]
) {
  if (selectedCells.length === 0) {
    return [];
  }

  const fillerOnly = selectedCells.every(([x, y]) => {
    const { pieceId } = parseCellRef(editorState.map[y][x]);
    return editorState.pieces[pieceId]?.type === FILLER_TILE_KEY;
  });

  if (!fillerOnly) {
    return [];
  }

  const signature = getSelectionSignature(selectedCells);

  return placementVariants.filter(
    (variant) =>
      sortCells(variant.usedSpace)
        .map(([x, y]) => `${x},${y}`)
        .join('|') === signature
  );
}

export function getPieceCells(editorState: EditorState, targetPieceId: string) {
  const cells: [number, number][] = [];

  editorState.map.forEach((row, y) => {
    row.forEach((value, x) => {
      const { pieceId } = parseCellRef(value);
      if (pieceId === targetPieceId) {
        cells.push([x, y]);
      }
    });
  });

  return sortCells(cells);
}

export function isSwitchPieceType(tileKey: string) {
  return SWITCH_TILE_KEYS.has(tileKey);
}

export function isSwitchButtonPieceType(tileKey: string) {
  return SWITCH_BUTTON_TILE_KEYS.has(tileKey);
}

export function canPiecesConnect(sourceType: string, targetType: string) {
  return (
    (isSwitchPieceType(sourceType) && isSwitchButtonPieceType(targetType)) ||
    (isSwitchButtonPieceType(sourceType) && isSwitchPieceType(targetType))
  );
}

function getPieceAnchor(editorState: EditorState, targetPieceId: string) {
  const cells = getPieceCells(editorState, targetPieceId);

  return {
    x: Math.min(...cells.map(([x]) => x)),
    y: Math.min(...cells.map(([, y]) => y)),
  };
}

function getSwitchEndpointSlot(
  tileKey: string,
  localX: number,
  localY: number
): 'upper' | 'lower' | 'main' {
  if (tileKey === 'singleSwitch' || tileKey === 'singleSwitchNoOcp') {
    return 'main';
  }

  if (tileKey === 'crossoverSwitch' || tileKey === 'crossoverSwitchNoOcp') {
    return localY === 0 ? 'upper' : 'lower';
  }

  if (tileKey === 'extendedSwitch' || tileKey === 'extendedSwitchNoOcp') {
    return localX === 0 ? 'lower' : 'upper';
  }

  return 'main';
}

export function getConnectionEndpointKey(
  editorState: EditorState,
  pieceId: string,
  part: number
) {
  const piece = editorState.pieces[pieceId];
  if (!piece) {
    return null;
  }

  if (isSwitchButtonPieceType(piece.type)) {
    return pieceId;
  }

  if (!isSwitchPieceType(piece.type)) {
    return null;
  }

  const anchor = getPieceAnchor(editorState, pieceId);
  let localCell: [number, number] | null = null;

  editorState.map.forEach((row, y) => {
    row.forEach((value, x) => {
      const ref = parseCellRef(value);
      if (ref.pieceId === pieceId && ref.part === part) {
        localCell = [x - anchor.x, y - anchor.y];
      }
    });
  });

  if (!localCell) {
    return `${pieceId}:main`;
  }

  const slot = getSwitchEndpointSlot(piece.type, localCell[0], localCell[1]);
  return `${pieceId}:${slot}`;
}

export function getConnectionPieceId(endpointKey: string) {
  return endpointKey.split(':', 1)[0];
}

export function getAllConnectionEndpointKeysForPiece(editorState: EditorState, pieceId: string) {
  const piece = editorState.pieces[pieceId];
  if (!piece) {
    return [];
  }

  if (isSwitchButtonPieceType(piece.type)) {
    return [pieceId];
  }

  if (piece.type === 'singleSwitch' || piece.type === 'singleSwitchNoOcp') {
    return [`${pieceId}:main`];
  }

  if (
    piece.type === 'crossoverSwitch' ||
    piece.type === 'crossoverSwitchNoOcp' ||
    piece.type === 'extendedSwitch' ||
    piece.type === 'extendedSwitchNoOcp'
  ) {
    return [`${pieceId}:upper`, `${pieceId}:lower`];
  }

  return [];
}
