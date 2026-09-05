import type {
  GroupSelection,
  PieceOrientation,
  StateGroupRegistry,
  TileCatalog,
  TileData,
} from './tile-types';
import { getDefaultTextValues, getInitialGroupSelections } from './tile-state';

export const FILLER_TILE_KEY = 'filler';

const SWITCH_TILE_KEYS = new Set([
  'crossoverSwitchNoOcp',
  'crossoverSwitch',
  'extendedSwitchNoOcp',
  'extendedSwitch',
  'singleExtendedSwitchNoOcp',
  'singleExtendedSwitch',
  'singleSwitchNoOcp',
  'singleSwitch',
]);

const SWITCH_BUTTON_TILE_KEYS = new Set(['switchButton']);
const LINEBLOCK_TILE_KEYS = new Set(['lineblock']);
const PREMAIN_SIGNAL_TILE_KEYS = new Set(['premainSignal', 'premainSignalNoOcp']);
const PRIVOLAVACIA_COUNTER_TILE_KEYS = new Set(['signButtonSealedCounter']);
const PRIVOLAVACIA_SIGNAL_TILE_KEYS = new Set([
  'entrySignal',
  'entrySignalNoOcp',
  'departureSignal',
  'departureSignalNoOcp',
]);

export type GridCellRef = `${string}.${number}`;

export interface PieceRecord {
  type: string;
  rotation: 0 | 180;
  mirrored: boolean;
  /** When set, this crossing uses inter-station sensor-range activation. */
  levelCrossingActivationRange?: number;
  state: {
    groups: Record<string, GroupSelection>;
    texts: Record<string, string>;
  };
}

export interface StationLayout {
  width: number;
  height: number;
  pieces: Record<string, PieceRecord>;
  map: GridCellRef[][];
  connections: Record<string, string>;
}

export interface PlacementVariant {
  tileKey: string;
  orientation: PieceOrientation;
  usedSpace: [number, number][];
  partsByKey: Record<string, number>;
}

export type LayoutExpansionDirection = 'left' | 'right' | 'top' | 'bottom';

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

export function transformPoint(
  x: number,
  y: number,
  space: { x: number; y: number },
  orientation: PieceOrientation
) {
  return getTransformedPoint(x, y, space, orientation);
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
      // Switch orientation changes traversal endpoints even when its occupied
      // cells have the same footprint (for example a 1×2 single switch).
      // Preserve every switch orientation for editor placement.
      const dedupeKey = SWITCH_TILE_KEYS.has(tileKey)
        ? `${tileKey}:${orientation.rotation}:${orientation.mirrored}`
        : `${tileKey}:${signature}`;

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

export function cloneStationLayout(layout: StationLayout): StationLayout {
  return {
    width: layout.width,
    height: layout.height,
    connections: { ...layout.connections },
    map: layout.map.map((row) => [...row]),
    pieces: Object.fromEntries(
      Object.entries(layout.pieces).map(([pieceId, piece]) => [
        pieceId,
        {
          ...piece,
          state: {
            groups: Object.fromEntries(
              Object.entries(piece.state.groups).map(([groupKey, selection]) => [
                groupKey,
                { ...selection },
              ])
            ),
            texts: { ...piece.state.texts },
          },
        },
      ])
    ),
  };
}

export function placePieceAt(
  layout: StationLayout,
  tileKey: string,
  anchorX: number,
  anchorY: number,
  tiles: TileCatalog,
  stateGroups: StateGroupRegistry,
  orientation: PieceOrientation = { rotation: 0, mirrored: false }
) {
  const tile = tiles[tileKey];
  const pieceId = createId();

  layout.pieces[pieceId] = {
    ...createPieceRecord(tileKey, tile, stateGroups),
    rotation: orientation.rotation,
    mirrored: orientation.mirrored,
  };

  const normalizedUsedSpace = buildPlacementVariants({ [tileKey]: tile }).find(
    (variant) =>
      variant.tileKey === tileKey &&
      variant.orientation.rotation === orientation.rotation &&
      variant.orientation.mirrored === orientation.mirrored
  )?.usedSpace;

  const usedSpace = normalizedUsedSpace ?? tile.usedSpace;

  usedSpace.forEach(([dx, dy], index) => {
    layout.map[anchorY + dy][anchorX + dx] = `${pieceId}.${index}`;
  });

  return pieceId;
}

export function createInitialStationLayout(
  width: number,
  height: number,
  tiles: TileCatalog,
  stateGroups: StateGroupRegistry
): StationLayout {
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

/**
 * Adds one or more empty cells at a board edge without changing any existing
 * piece IDs or connections. Adding left/top naturally shifts every piece's
 * rendered position because the map gains cells before the existing map.
 */
export function expandStationLayout(
  layout: StationLayout,
  direction: LayoutExpansionDirection,
  amount: number,
  tiles: TileCatalog,
  stateGroups: StateGroupRegistry,
): StationLayout {
  if (!Number.isInteger(amount) || amount < 1) {
    return layout;
  }

  const fillerTile = tiles[FILLER_TILE_KEY];
  if (!fillerTile) {
    throw new Error(`Missing required filler tile "${FILLER_TILE_KEY}".`);
  }

  const pieces = { ...layout.pieces };
  const createFillerCell = () => {
    const pieceId = createId();
    pieces[pieceId] = createPieceRecord(FILLER_TILE_KEY, fillerTile, stateGroups);
    return `${pieceId}.0` as GridCellRef;
  };
  const createFillerRow = (width: number) =>
    Array.from({ length: width }, () => createFillerCell());

  let map: GridCellRef[][];
  let width = layout.width;
  let height = layout.height;

  if (direction === 'left') {
    map = layout.map.map((row) => [
      ...Array.from({ length: amount }, () => createFillerCell()),
      ...row,
    ]);
    width += amount;
  } else if (direction === 'right') {
    map = layout.map.map((row) => [
      ...row,
      ...Array.from({ length: amount }, () => createFillerCell()),
    ]);
    width += amount;
  } else if (direction === 'top') {
    map = [
      ...Array.from({ length: amount }, () => createFillerRow(width)),
      ...layout.map.map((row) => [...row]),
    ];
    height += amount;
  } else {
    map = [
      ...layout.map.map((row) => [...row]),
      ...Array.from({ length: amount }, () => createFillerRow(width)),
    ];
    height += amount;
  }

  return { width, height, map, pieces, connections: { ...layout.connections } };
}

export function getRenderablePieces(layout: StationLayout) {
  const refs = new Map<string, { cells: [number, number][] }>();

  layout.map.forEach((row, y) => {
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

export function getPieceAnchor(layout: StationLayout, targetPieceId: string) {
  const cells = getPieceCells(layout, targetPieceId);

  return {
    x: Math.min(...cells.map(([x]) => x)),
    y: Math.min(...cells.map(([, y]) => y)),
  };
}

export function getAllowedPlacements(
  layout: StationLayout,
  selectedCells: [number, number][],
  placementVariants: PlacementVariant[]
) {
  if (selectedCells.length === 0) {
    return [];
  }

  const fillerOnly = selectedCells.every(([x, y]) => {
    const { pieceId } = parseCellRef(layout.map[y][x]);
    return layout.pieces[pieceId]?.type === FILLER_TILE_KEY;
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

export function getPieceCells(layout: StationLayout, targetPieceId: string) {
  const cells: [number, number][] = [];

  layout.map.forEach((row, y) => {
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

export function isLineblockPieceType(tileKey: string) {
  return LINEBLOCK_TILE_KEYS.has(tileKey);
}

export function isPremainSignalPieceType(tileKey: string) {
  return PREMAIN_SIGNAL_TILE_KEYS.has(tileKey);
}

export function isPrivolavaciaCounterPieceType(tileKey: string) {
  return PRIVOLAVACIA_COUNTER_TILE_KEYS.has(tileKey);
}

export function isPrivolavaciaSignalPieceType(tileKey: string) {
  return PRIVOLAVACIA_SIGNAL_TILE_KEYS.has(tileKey);
}

export function canPiecesConnect(sourceType: string, targetType: string) {
  return (
    (isSwitchPieceType(sourceType) && isSwitchButtonPieceType(targetType)) ||
    (isSwitchButtonPieceType(sourceType) && isSwitchPieceType(targetType)) ||
    (isLineblockPieceType(sourceType) && isPremainSignalPieceType(targetType)) ||
    (isPremainSignalPieceType(sourceType) && isLineblockPieceType(targetType)) ||
    (isPrivolavaciaCounterPieceType(sourceType) && isPrivolavaciaSignalPieceType(targetType)) ||
    (isPrivolavaciaSignalPieceType(sourceType) && isPrivolavaciaCounterPieceType(targetType))
  );
}

function getSwitchEndpointSlot(
  tileKey: string,
  localX: number,
  _localY?: number,
): 'upper' | 'lower' | 'main' {
  void _localY;

  if (
    tileKey === 'singleSwitch' ||
    tileKey === 'singleSwitchNoOcp' ||
    tileKey === 'singleExtendedSwitch' ||
    tileKey === 'singleExtendedSwitchNoOcp'
  ) {
    return 'main';
  }

  if (tileKey === 'crossoverSwitch' || tileKey === 'crossoverSwitchNoOcp') {
    return 'main';
  }

  if (
    tileKey === 'extendedSwitch' ||
    tileKey === 'extendedSwitchNoOcp' ||
    tileKey === 'singleExtendedSwitch' ||
    tileKey === 'singleExtendedSwitchNoOcp'
  ) {
    return localX === 0 ? 'lower' : 'upper';
  }

  return 'main';
}

export function getConnectionEndpointKey(layout: StationLayout, pieceId: string, part: number) {
  const piece = layout.pieces[pieceId];
  if (!piece) {
    return null;
  }

  if (isSwitchButtonPieceType(piece.type)) {
    return pieceId;
  }

  if (isPrivolavaciaCounterPieceType(piece.type)) {
    return pieceId;
  }

  if (
    isLineblockPieceType(piece.type) ||
    isPremainSignalPieceType(piece.type) ||
    isPrivolavaciaSignalPieceType(piece.type)
  ) {
    return pieceId;
  }

  if (!isSwitchPieceType(piece.type)) {
    return null;
  }

  const anchor = getPieceAnchor(layout, pieceId);
  let localCell: [number, number] | null = null;

  layout.map.forEach((row, y) => {
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

export function getAllConnectionEndpointKeysForPiece(layout: StationLayout, pieceId: string) {
  const piece = layout.pieces[pieceId];
  if (!piece) {
    return [];
  }

  if (isSwitchButtonPieceType(piece.type)) {
    return [pieceId];
  }

  if (isPrivolavaciaCounterPieceType(piece.type)) {
    return [
      pieceId,
      ...Object.keys(layout.connections).filter((endpointKey) =>
        endpointKey.startsWith(`${pieceId}:pn:`),
      ),
    ];
  }

  if (
    isLineblockPieceType(piece.type) ||
    isPremainSignalPieceType(piece.type) ||
    isPrivolavaciaSignalPieceType(piece.type)
  ) {
    return [pieceId];
  }

  if (
    piece.type === 'singleSwitch' ||
    piece.type === 'singleSwitchNoOcp' ||
    piece.type === 'singleExtendedSwitch' ||
    piece.type === 'singleExtendedSwitchNoOcp'
  ) {
    return [`${pieceId}:main`];
  }

  if (
    piece.type === 'crossoverSwitch' ||
    piece.type === 'crossoverSwitchNoOcp' ||
    piece.type === 'extendedSwitch' ||
    piece.type === 'extendedSwitchNoOcp'
  ) {
    if (piece.type === 'crossoverSwitch' || piece.type === 'crossoverSwitchNoOcp') {
      return [`${pieceId}:main`];
    }

    return [`${pieceId}:upper`, `${pieceId}:lower`];
  }

  return [];
}

export function getLineblockPremainLinksFromLayout(layout: StationLayout) {
  const links: Record<
    string,
    {
      lineblockPieceId: string;
      premainSignalPieceId: string;
    }
  > = {};

  Object.entries(layout.connections).forEach(([endpointKey, linkedEndpointKey]) => {
    const sourcePieceId = getConnectionPieceId(endpointKey);
    const targetPieceId = getConnectionPieceId(linkedEndpointKey);
    const sourcePiece = layout.pieces[sourcePieceId];
    const targetPiece = layout.pieces[targetPieceId];

    if (!sourcePiece || !targetPiece) {
      return;
    }

    if (isLineblockPieceType(sourcePiece.type) && isPremainSignalPieceType(targetPiece.type)) {
      links[sourcePieceId] = {
        lineblockPieceId: sourcePieceId,
        premainSignalPieceId: targetPieceId,
      };
    }
  });

  return links;
}

export function getPrivolavaciaConnectionKey(sealedCounterPieceId: string, signalPieceId: string) {
  return `${sealedCounterPieceId}:pn:${signalPieceId}`;
}

export function getConnectedPieceIdsForEndpointKey(layout: StationLayout, endpointKey: string | null) {
  if (!endpointKey) {
    return [];
  }

  if (layout.connections[endpointKey]) {
    return [getConnectionPieceId(layout.connections[endpointKey])];
  }

  const pieceId = getConnectionPieceId(endpointKey);
  const piece = layout.pieces[pieceId];
  if (!piece || !isPrivolavaciaCounterPieceType(piece.type)) {
    return [];
  }

  return Object.entries(layout.connections)
    .filter(([sourceEndpointKey, linkedEndpointKey]) => {
      return (
        sourceEndpointKey.startsWith(`${pieceId}:pn:`) &&
        getConnectionPieceId(linkedEndpointKey) !== pieceId
      );
    })
    .map(([, linkedEndpointKey]) => getConnectionPieceId(linkedEndpointKey))
    .filter((connectedPieceId, index, allIds) => allIds.indexOf(connectedPieceId) === index);
}

export function getPrivolavaciaSignalLinksFromLayout(layout: StationLayout) {
  const links: Record<string, string[]> = {};

  Object.entries(layout.connections).forEach(([endpointKey, linkedEndpointKey]) => {
    const sourcePieceId = getConnectionPieceId(endpointKey);
    const targetPieceId = getConnectionPieceId(linkedEndpointKey);
    const sourcePiece = layout.pieces[sourcePieceId];
    const targetPiece = layout.pieces[targetPieceId];

    if (
      !sourcePiece ||
      !targetPiece ||
      !isPrivolavaciaCounterPieceType(sourcePiece.type) ||
      !isPrivolavaciaSignalPieceType(targetPiece.type) ||
      !endpointKey.startsWith(`${sourcePieceId}:pn:`)
    ) {
      return;
    }

    links[sourcePieceId] ??= [];
    if (!links[sourcePieceId].includes(targetPieceId)) {
      links[sourcePieceId].push(targetPieceId);
    }
  });

  return links;
}
