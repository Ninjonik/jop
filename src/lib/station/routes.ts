import type {
  ActiveTrainRoute,
  ActiveTrainRouteOccupation,
  RouteDebugStep,
  RoutePathStep,
  RuntimeRouteClass,
  RuntimeRouteDirection,
  RuntimeRouteType,
  StationDocument,
} from './domain';
import type { StationLayout } from './layout';
import {
  getPieceAnchor,
  getPieceCells,
  isPremainSignalPieceType,
  parseCellRef,
  transformPoint,
} from './layout';
import { isSwitchTraversalAllowedByButtonLocks } from './switches';
import type { PieceOrientation, TileCatalog, TraversableStateMap } from './tile-types';

type ExitPoint = {
  x: number;
  y: number;
};

type TraversalOption = {
  state: string;
  occupationState: string;
  occupationVariant: string;
  entry: ExitPoint;
  exit: ExitPoint;
};

type RouteSearchState = {
  pieceId: string;
  entry: ExitPoint;
  cost: number;
  visitedPieceIds: string[];
  reservedOccupations: Record<string, ActiveTrainRouteOccupation>;
  signalPieceIds: string[];
  debugSteps: RouteDebugStep[];
};

export type StationRouteBuildResult = {
  routeType: RuntimeRouteType;
  routeClass: RuntimeRouteClass;
  direction: RuntimeRouteDirection;
  sourcePieceId: string;
  targetPieceId: string;
  reservedOccupations: ActiveTrainRouteOccupation[];
  signalPieceIds: string[];
  targetPlatformDepartureSignalPieceId: string | null;
  path: RoutePathStep[];
  debugSteps: RouteDebugStep[];
};

type RouteEndpointTraversal = {
  pieceId: string;
  entry: ExitPoint;
};

const TRAVERSAL_FALLBACK_TYPES: Record<string, string> = {
  crossoverSwitchNoOcp: 'crossoverSwitch',
  departureSignalNoOcp: 'departureSignal',
  entrySignalNoOcp: 'entrySignal',
  extendedSwitchNoOcp: 'extendedSwitch',
  premainSignalNoOcp: 'premainSignal',
  shuntButtonNoOcp: 'shuntButton',
  shuntSignalNoOcp: 'shuntSignal',
  singleSwitchNoOcp: 'singleSwitch',
  trackNoOcp: 'track',
  trackSignNoOcp: 'trackSign',
};

function getTraversalTile(pieceType: string, tiles: TileCatalog) {
  const tile = tiles[pieceType];
  if (tile?.traversable !== false) {
    return tile;
  }

  const fallbackType = TRAVERSAL_FALLBACK_TYPES[pieceType];
  return fallbackType ? tiles[fallbackType] : tile;
}

function getSignalFacingDirection(
  pieceType: string,
  rotation: 0 | 180,
): RuntimeRouteDirection | null {
  const defaultDirection: RuntimeRouteDirection =
    pieceType === 'departureSignal' ||
    pieceType === 'departureSignalNoOcp' ||
    pieceType === 'premainSignal' ||
    pieceType === 'premainSignalNoOcp' ||
    pieceType === 'shuntSignalButtonBuffer'
      ? 'right-to-left'
      : 'left-to-right';

  if (!isSignalPieceType(pieceType)) {
    return null;
  }

  if (rotation === 180) {
    return defaultDirection === 'left-to-right' ? 'right-to-left' : 'left-to-right';
  }

  return defaultDirection;
}

function parseOffsetKey(key: string): ExitPoint {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function toOffsetKey(point: ExitPoint) {
  return `${point.x},${point.y}`;
}

function normalizeDirection(direction: RuntimeRouteDirection) {
  return direction === 'left-to-right' ? 1 : -1;
}

function buildOrderedRoutePath(
  station: StationDocument,
  sourcePieceId: string,
  targetPieceId: string,
  direction: RuntimeRouteDirection,
  debugSteps: RouteDebugStep[],
  reservedOccupations: ActiveTrainRouteOccupation[],
) {
  const reservations = new Map(
    reservedOccupations.map((occupation) => [occupation.pieceId, occupation]),
  );
  const byPieceId = new Map<string, RoutePathStep>();

  debugSteps.forEach((step) => {
    byPieceId.set(step.pieceId, {
      pieceId: step.pieceId,
      traversalState: step.traversableState,
      occupationState: step.occupationState,
      signalPieceId: step.signalIncluded ? step.pieceId : null,
    });
  });

  [sourcePieceId, targetPieceId].forEach((pieceId) => {
    if (byPieceId.has(pieceId)) {
      return;
    }

    const piece = station.layout.pieces[pieceId];
    const reservation = reservations.get(pieceId);
    byPieceId.set(pieceId, {
      pieceId,
      traversalState: '0',
      occupationState: reservation?.state ?? null,
      signalPieceId: piece && isSignalPieceType(piece.type) ? pieceId : null,
    });
  });

  const directionSign = normalizeDirection(direction);
  return Array.from(byPieceId.values()).sort((a, b) => {
    const anchorA = getPieceAnchor(station.layout, a.pieceId);
    const anchorB = getPieceAnchor(station.layout, b.pieceId);
    return (anchorA.x - anchorB.x) * directionSign;
  });
}

function getOccupationState(
  pieceType: string,
  traversableState: string,
  entry?: ExitPoint,
  exit?: ExitPoint,
) {
  // A single switch draws its diagonal as the top occupation segment. The shared
  // blTtr state also lights straight segments needed by the extended switch.
  if (pieceType === 'singleSwitch' && traversableState === 'blTtr') {
    return 't';
  }

  if (
    pieceType === 'crossoverSwitch' &&
    traversableState === 'tlTtrAblTbr' &&
    entry &&
    exit &&
    entry.y === exit.y
  ) {
    return entry.y === 0 ? 't' : 'b';
  }

  return traversableState === '0' ? 'reserved' : traversableState;
}

function transformExternalPoint(
  point: ExitPoint,
  space: { x: number; y: number },
  orientation: PieceOrientation,
) {
  const [x, y] = transformPoint(point.x, point.y, space, orientation);
  return { x, y };
}

function getTraversalOptions(
  station: StationDocument,
  pieceId: string,
  tiles: TileCatalog,
): TraversalOption[] {
  const piece = station.layout.pieces[pieceId];
  if (!piece) {
    return [];
  }

  const tile = getTraversalTile(piece.type, tiles);
  if (!tile || tile.traversable === false) {
    return [];
  }

  const options: TraversalOption[] = [];
  const traversable = tile.traversable as TraversableStateMap;

  Object.entries(traversable).forEach(([stateKey, routes]) => {
    Object.entries(routes ?? {}).forEach(([entryKey, exitKey]) => {
      const entry = transformExternalPoint(parseOffsetKey(entryKey), tile.space, {
        rotation: piece.rotation,
        mirrored: piece.mirrored,
      });
      const exit = transformExternalPoint(parseOffsetKey(exitKey), tile.space, {
        rotation: piece.rotation,
        mirrored: piece.mirrored,
      });

      options.push({
        state: stateKey,
        occupationState: getOccupationState(piece.type, stateKey, entry, exit),
        occupationVariant: stateKey === '0' ? 'normal' : 'reserved',
        entry,
        exit,
      });
    });
  });

  return options;
}

function getNeighborTraversal(station: StationDocument, sourcePieceId: string, exit: ExitPoint) {
  const adjacent = getAdjacentTraversal(station, sourcePieceId, exit);
  if (!adjacent) {
    return null;
  }

  return {
    pieceId: adjacent.pieceId,
    entry: adjacent.entryFromSource,
  };
}

function getAdjacentTraversal(station: StationDocument, sourcePieceId: string, edge: ExitPoint) {
  const sourceAnchor = getPieceAnchor(station.layout, sourcePieceId);
  const sourcePiece = station.layout.pieces[sourcePieceId];
  if (!sourcePiece) {
    return null;
  }

  const step = getTraversalEdgeStep(station, sourcePieceId, edge);
  if (!step) {
    return null;
  }

  const neighborCell = {
    x: sourceAnchor.x + edge.x,
    y: sourceAnchor.y + edge.y,
  };

  if (
    neighborCell.x < 0 ||
    neighborCell.y < 0 ||
    neighborCell.y >= station.layout.height ||
    neighborCell.x >= station.layout.width
  ) {
    return null;
  }

  const neighborRef = parseCellRef(station.layout.map[neighborCell.y][neighborCell.x]);
  const neighborAnchor = getPieceAnchor(station.layout, neighborRef.pieceId);
  const entryFromSource = {
    x: neighborCell.x - neighborAnchor.x - step.x,
    y: neighborCell.y - neighborAnchor.y - step.y,
  };
  const exitToSource = {
    x: neighborCell.x - neighborAnchor.x + step.x,
    y: neighborCell.y - neighborAnchor.y + step.y,
  };

  return {
    pieceId: neighborRef.pieceId,
    entryFromSource,
    exitToSource,
  };
}

function getTraversalEdgeStep(
  station: StationDocument,
  pieceId: string,
  edge: ExitPoint,
): ExitPoint | null {
  const anchor = getPieceAnchor(station.layout, pieceId);
  const localCells = getPieceCells(station.layout, pieceId).map(([x, y]) => ({
    x: x - anchor.x,
    y: y - anchor.y,
  }));
  const adjacentSourceCell = localCells
    .filter((cell) => Math.abs(edge.x - cell.x) + Math.abs(edge.y - cell.y) === 1)
    // Railway connections are horizontal; prefer the same row at irregular tile corners.
    .sort((left, right) => Math.abs(edge.y - left.y) - Math.abs(edge.y - right.y))[0];

  if (!adjacentSourceCell) {
    return null;
  }

  return {
    x: edge.x - adjacentSourceCell.x,
    y: edge.y - adjacentSourceCell.y,
  };
}

function getPieceCenter(layout: StationLayout, pieceId: string) {
  const cells = getPieceCells(layout, pieceId);
  return {
    x: cells.reduce((sum, [x]) => sum + x, 0) / cells.length,
    y: cells.reduce((sum, [, y]) => sum + y, 0) / cells.length,
  };
}

function getTrackSideNeighbor(
  station: StationDocument,
  departureButtonPieceId: string,
  directionX: number,
) {
  const anchor = getPieceAnchor(station.layout, departureButtonPieceId);
  const candidateCell = {
    x: anchor.x + directionX,
    y: anchor.y,
  };

  if (
    candidateCell.x < 0 ||
    candidateCell.y < 0 ||
    candidateCell.y >= station.layout.height ||
    candidateCell.x >= station.layout.width
  ) {
    return null;
  }

  const ref = parseCellRef(station.layout.map[candidateCell.y][candidateCell.x]);
  return {
    pieceId: ref.pieceId,
    entry: directionX > 0 ? { x: -1, y: 0 } : { x: 1, y: 0 },
  };
}

function getPlatformTrackNeighbor(station: StationDocument, departureButtonPieceId: string) {
  const anchor = getPieceAnchor(station.layout, departureButtonPieceId);
  const directions = [-1, 1];

  for (const directionX of directions) {
    const candidate = getTrackSideNeighbor(station, departureButtonPieceId, directionX);
    if (!candidate) {
      continue;
    }

    const piece = station.layout.pieces[candidate.pieceId];
    if (!piece) {
      continue;
    }

    if (piece.type === 'departureSignal' || piece.type === 'departureSignalNoOcp') {
      continue;
    }

    const tileAnchor = getPieceAnchor(station.layout, candidate.pieceId);
    if (tileAnchor.y !== anchor.y) {
      continue;
    }

    return candidate;
  }

  return null;
}

function getDepartureSignalTraversal(station: StationDocument, departureButtonPieceId: string) {
  const buttonAnchor = getPieceAnchor(station.layout, departureButtonPieceId);
  const directions = [-1, 1];

  for (const directionX of directions) {
    const signalCell = {
      x: buttonAnchor.x + directionX,
      y: buttonAnchor.y,
    };

    if (
      signalCell.x < 0 ||
      signalCell.y < 0 ||
      signalCell.y >= station.layout.height ||
      signalCell.x >= station.layout.width
    ) {
      continue;
    }

    const ref = parseCellRef(station.layout.map[signalCell.y][signalCell.x]);
    const piece = station.layout.pieces[ref.pieceId];
    if (piece?.type !== 'departureSignal' && piece?.type !== 'departureSignalNoOcp') {
      continue;
    }

    return {
      pieceId: ref.pieceId,
      entry: directionX > 0 ? { x: -1, y: 0 } : { x: 1, y: 0 },
    };
  }

  return null;
}

function getArrivalTargetTraversal(station: StationDocument, departureButtonPieceId: string) {
  const buttonAnchor = getPieceAnchor(station.layout, departureButtonPieceId);
  const directions = [-1, 1];

  for (const directionX of directions) {
    const signalCell = {
      x: buttonAnchor.x + directionX,
      y: buttonAnchor.y,
    };

    if (
      signalCell.x < 0 ||
      signalCell.y < 0 ||
      signalCell.y >= station.layout.height ||
      signalCell.x >= station.layout.width
    ) {
      continue;
    }

    const ref = parseCellRef(station.layout.map[signalCell.y][signalCell.x]);
    const piece = station.layout.pieces[ref.pieceId];
    if (piece?.type !== 'departureSignal' && piece?.type !== 'departureSignalNoOcp') {
      continue;
    }

    return {
      pieceId: ref.pieceId,
      entry: directionX > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 },
    };
  }

  return null;
}

function getShuntSourceTraversal(
  station: StationDocument,
  sourcePieceId: string,
  directionSign: number,
) {
  const sourcePiece = station.layout.pieces[sourcePieceId];
  if (!sourcePiece) {
    return null;
  }

  const adjacent = getAdjacentTraversal(station, sourcePieceId, {
    x: directionSign,
    y: 0,
  });
  if (!adjacent) {
    return null;
  }

  if (sourcePiece.type === 'shuntSignalButtonBuffer') {
    return {
      traversal: {
        pieceId: adjacent.pieceId,
        entry: adjacent.entryFromSource,
      },
      sourceSignalPieceId: sourcePieceId,
    };
  }

  const adjacentPiece = station.layout.pieces[adjacent.pieceId];
  if (
    adjacentPiece?.type !== 'departureSignal' &&
    adjacentPiece?.type !== 'departureSignalNoOcp' &&
    adjacentPiece?.type !== 'shuntSignal' &&
    adjacentPiece?.type !== 'shuntSignalNoOcp'
  ) {
    return null;
  }

  return {
    traversal: {
      pieceId: adjacent.pieceId,
      entry: adjacent.entryFromSource,
    },
    sourceSignalPieceId: null,
  };
}

function isRouteControlPieceType(pieceType: string) {
  return (
    pieceType === 'departureButton' ||
    pieceType === 'shuntButton' ||
    pieceType === 'shuntButtonNoOcp' ||
    pieceType === 'shuntSignalButtonBuffer'
  );
}

function getInlineTargetTraversal(
  station: StationDocument,
  pieceId: string,
  sourcePieceId: string,
): RouteEndpointTraversal | null {
  const sourceCenter = getPieceCenter(station.layout, sourcePieceId);
  const targetCenter = getPieceCenter(station.layout, pieceId);
  const piece = station.layout.pieces[pieceId];
  if (!piece) {
    return null;
  }

  return {
    pieceId,
    entry: sourceCenter.x <= targetCenter.x ? { x: -1, y: 0 } : { x: 1, y: 0 },
  };
}

function isSignalPieceType(pieceType: string) {
  return (
    pieceType === 'entrySignal' ||
    pieceType === 'entrySignalNoOcp' ||
    pieceType === 'departureSignal' ||
    pieceType === 'departureSignalNoOcp' ||
    pieceType === 'premainSignal' ||
    pieceType === 'premainSignalNoOcp' ||
    pieceType === 'shuntSignal' ||
    pieceType === 'shuntSignalNoOcp' ||
    pieceType === 'shuntSignalButtonBuffer'
  );
}

function isOccupiablePiece(station: StationDocument, pieceId: string, tiles: TileCatalog) {
  const piece = station.layout.pieces[pieceId];
  if (!piece) {
    return false;
  }

  return Boolean(tiles[piece.type]?.groups?.occupation);
}

function getRouteDirection(
  station: StationDocument,
  sourcePieceId: string,
  targetPieceId: string,
): RuntimeRouteDirection {
  return getPieceCenter(station.layout, targetPieceId).x >=
    getPieceCenter(station.layout, sourcePieceId).x
    ? 'left-to-right'
    : 'right-to-left';
}

function findAdjacentDepartureSignal(station: StationDocument, departureButtonPieceId: string) {
  const buttonAnchor = getPieceAnchor(station.layout, departureButtonPieceId);
  const signalOffsets = [-1, 1];

  for (const offsetX of signalOffsets) {
    const signalCellX = buttonAnchor.x + offsetX;
    if (signalCellX < 0 || signalCellX >= station.layout.width) {
      continue;
    }

    const ref = parseCellRef(station.layout.map[buttonAnchor.y][signalCellX]);
    const piece = station.layout.pieces[ref.pieceId];
    if (piece?.type === 'departureSignal' || piece?.type === 'departureSignalNoOcp') {
      return ref.pieceId;
    }
  }

  return null;
}

function getTargetPieceContribution(
  station: StationDocument,
  pieceId: string,
  entry: ExitPoint,
  directionSign: number,
  tiles: TileCatalog,
) {
  const piece = station.layout.pieces[pieceId];
  if (!piece) {
    return {
      occupation: null,
      includeSignal: false,
      exit: null,
    };
  }

  const matchingOption = getTraversalOptions(station, pieceId, tiles).find((option) => {
    if (toOffsetKey(option.entry) !== toOffsetKey(entry)) {
      return false;
    }

    return Math.sign(getTraversalEdgeStep(station, pieceId, option.exit)?.x ?? 0) === directionSign;
  });

  return {
    occupation:
      matchingOption && isOccupiablePiece(station, pieceId, tiles)
        ? {
            pieceId,
            state: matchingOption.occupationState,
            variant: matchingOption.occupationVariant,
          }
        : null,
    includeSignal: isSignalPieceType(piece.type),
    exit: matchingOption?.exit ?? null,
  };
}

function getTraversalFootprintWeight(state: string) {
  if (state === '0' || state === 'reserved') {
    return 1;
  }

  if (
    state === 't' ||
    state === 'b' ||
    state === 'blTbr' ||
    state === 'blTtr' ||
    state === 'blTmr' ||
    state === 'tlTtr' ||
    state === 'brAtl'
  ) {
    return 2;
  }

  if (state === 'tlTtrAblTbr') {
    return 2;
  }

  return 10;
}

function getTraversalPreferenceRank(state: string) {
  if (state === '0' || state === 'reserved') return 0;
  if (state === 'tlTtrAblTbr') return 1;
  if (state === 't' || state === 'b') return 2;
  if (state === 'blTbr' || state === 'blTtr' || state === 'blTmr') return 3;
  if (state === 'tlTtr' || state === 'brAtl') return 4;
  return 10;
}

function getTraversalSearchCost(pieceType: string, traversableState: string) {
  if (pieceType === 'crossoverSwitch') {
    return traversableState === 'blTtr' ? 2 : 1;
  }

  return 1;
}

function getSortedMatchingTraversalOptions(
  station: StationDocument,
  pieceId: string,
  entry: ExitPoint,
  directionSign: number,
  tiles: TileCatalog,
) {
  return getTraversalOptions(station, pieceId, tiles)
    .filter((option) => toOffsetKey(option.entry) === toOffsetKey(entry))
    .filter((option) => {
      return (
        Math.sign(getTraversalEdgeStep(station, pieceId, option.exit)?.x ?? 0) === directionSign
      );
    })
    .sort((left, right) => {
      const weightDiff =
        getTraversalFootprintWeight(left.state) - getTraversalFootprintWeight(right.state);
      if (weightDiff !== 0) {
        return weightDiff;
      }

      const preferenceDiff =
        getTraversalPreferenceRank(left.state) - getTraversalPreferenceRank(right.state);
      if (preferenceDiff !== 0) {
        return preferenceDiff;
      }

      return left.state.localeCompare(right.state);
    });
}

function pushReservation(
  station: StationDocument,
  reservedMap: Record<string, ActiveTrainRouteOccupation>,
  pieceId: string,
  occupation: ActiveTrainRouteOccupation | null,
) {
  if (!occupation) {
    return;
  }

  const piece = station.layout.pieces[pieceId];
  if (piece?.state.groups.occupation?.state === 'occupied') {
    return;
  }

  reservedMap[pieceId] = occupation;
}

function traceForwardToBoundary(
  station: StationDocument,
  startPieceId: string,
  startEntry: ExitPoint,
  directionSign: number,
  tiles: TileCatalog,
) {
  const reservedMap: Record<string, ActiveTrainRouteOccupation> = {};
  const signalPieceIds: string[] = [];
  const debugSteps: RouteDebugStep[] = [];
  const visited = new Set<string>();

  let currentPieceId: string | null = startPieceId;
  let currentEntry: ExitPoint | null = startEntry;

  while (currentPieceId && currentEntry) {
    const visitedKey = `${currentPieceId}:${toOffsetKey(currentEntry)}`;
    if (visited.has(visitedKey)) {
      break;
    }
    visited.add(visitedKey);

    const piece = station.layout.pieces[currentPieceId];
    if (!piece) {
      break;
    }

    const option = getSortedMatchingTraversalOptions(
      station,
      currentPieceId,
      currentEntry,
      directionSign,
      tiles,
    )[0];

    if (!option) {
      break;
    }

    const occupation = isOccupiablePiece(station, currentPieceId, tiles)
      ? {
          pieceId: currentPieceId,
          state: option.occupationState,
          variant: option.occupationVariant,
        }
      : null;

    pushReservation(station, reservedMap, currentPieceId, occupation);

    if (isSignalPieceType(piece.type)) {
      signalPieceIds.push(currentPieceId);
    }

    debugSteps.push({
      pieceId: currentPieceId,
      pieceType: piece.type,
      anchor: `${getPieceAnchor(station.layout, currentPieceId).x},${getPieceAnchor(station.layout, currentPieceId).y}`,
      cells: getPieceCells(station.layout, currentPieceId).map(([x, y]) => `${x},${y}`),
      rotation: piece.rotation,
      mirrored: piece.mirrored,
      entry: toOffsetKey(option.entry),
      exit: toOffsetKey(option.exit),
      traversableState: option.state,
      occupationState: occupation?.state ?? null,
      occupationVariant: occupation?.variant ?? null,
      signalIncluded: isSignalPieceType(piece.type),
    });

    const neighbor = getNeighborTraversal(station, currentPieceId, option.exit);
    if (!neighbor) {
      break;
    }

    currentPieceId = neighbor.pieceId;
    currentEntry = neighbor.entry;
  }

  return {
    reservedOccupations: Object.values(reservedMap),
    signalPieceIds,
    debugSteps,
  };
}

function tracePlatformToNextControl(
  station: StationDocument,
  startPieceId: string,
  startEntry: ExitPoint,
  directionSign: number,
  tiles: TileCatalog,
) {
  const reservedMap: Record<string, ActiveTrainRouteOccupation> = {};
  const debugSteps: RouteDebugStep[] = [];
  const visited = new Set<string>();
  let currentPieceId: string | null = startPieceId;
  let currentEntry: ExitPoint | null = startEntry;

  while (currentPieceId && currentEntry) {
    const visitedKey = `${currentPieceId}:${toOffsetKey(currentEntry)}`;
    if (visited.has(visitedKey)) {
      break;
    }
    visited.add(visitedKey);

    const piece = station.layout.pieces[currentPieceId];
    if (!piece || isSignalPieceType(piece.type)) {
      break;
    }

    if (isRouteControlPieceType(piece.type)) {
      if (isOccupiablePiece(station, currentPieceId, tiles)) {
        pushReservation(station, reservedMap, currentPieceId, {
          pieceId: currentPieceId,
          state: 'reserved',
          variant: 'normal',
        });
      }
      break;
    }

    const option = getSortedMatchingTraversalOptions(
      station,
      currentPieceId,
      currentEntry,
      directionSign,
      tiles,
    )[0];
    if (!option) {
      break;
    }

    const occupation = isOccupiablePiece(station, currentPieceId, tiles)
      ? {
          pieceId: currentPieceId,
          state: option.occupationState,
          variant: option.occupationVariant,
        }
      : null;
    pushReservation(station, reservedMap, currentPieceId, occupation);

    debugSteps.push({
      pieceId: currentPieceId,
      pieceType: piece.type,
      anchor: `${getPieceAnchor(station.layout, currentPieceId).x},${getPieceAnchor(station.layout, currentPieceId).y}`,
      cells: getPieceCells(station.layout, currentPieceId).map(([x, y]) => `${x},${y}`),
      rotation: piece.rotation,
      mirrored: piece.mirrored,
      entry: toOffsetKey(option.entry),
      exit: toOffsetKey(option.exit),
      traversableState: option.state,
      occupationState: occupation?.state ?? null,
      occupationVariant: occupation?.variant ?? null,
      signalIncluded: false,
    });

    const neighbor = getNeighborTraversal(station, currentPieceId, option.exit);
    if (!neighbor) {
      break;
    }
    currentPieceId = neighbor.pieceId;
    currentEntry = neighbor.entry;
  }

  return {
    reservedOccupations: Object.values(reservedMap),
    debugSteps,
  };
}

function traceBackwardToBoundary(
  station: StationDocument,
  startPieceId: string,
  exitToStation: ExitPoint,
  directionSign: number,
  tiles: TileCatalog,
) {
  const reservedMap: Record<string, ActiveTrainRouteOccupation> = {};
  const signalPieceIds: string[] = [];
  const debugSteps: RouteDebugStep[] = [];
  const visited = new Set<string>();

  let currentPieceId: string | null = startPieceId;
  let currentExit: ExitPoint | null = exitToStation;

  while (currentPieceId && currentExit) {
    const exitToMatch = currentExit;
    const pieceId = currentPieceId;
    const visitedKey = `${pieceId}:${toOffsetKey(exitToMatch)}`;
    if (visited.has(visitedKey)) {
      break;
    }
    visited.add(visitedKey);

    const piece = station.layout.pieces[pieceId];
    if (!piece) {
      break;
    }

    const option = getTraversalOptions(station, pieceId, tiles)
      .filter((candidate) => toOffsetKey(candidate.exit) === toOffsetKey(exitToMatch))
      .filter((candidate) => {
        return (
          Math.sign(getTraversalEdgeStep(station, pieceId, candidate.exit)?.x ?? 0) ===
          directionSign
        );
      })
      .sort((left, right) => {
        const weightDiff =
          getTraversalFootprintWeight(left.state) - getTraversalFootprintWeight(right.state);
        if (weightDiff !== 0) {
          return weightDiff;
        }

        const preferenceDiff =
          getTraversalPreferenceRank(left.state) - getTraversalPreferenceRank(right.state);
        if (preferenceDiff !== 0) {
          return preferenceDiff;
        }

        return left.state.localeCompare(right.state);
      })[0];

    if (!option) {
      break;
    }

    const occupation = isOccupiablePiece(station, pieceId, tiles)
      ? {
          pieceId,
          state: option.occupationState,
          variant: option.occupationVariant,
        }
      : null;

    pushReservation(station, reservedMap, pieceId, occupation);

    if (isSignalPieceType(piece.type)) {
      signalPieceIds.push(pieceId);
    }

    debugSteps.push({
      pieceId,
      pieceType: piece.type,
      anchor: `${getPieceAnchor(station.layout, pieceId).x},${getPieceAnchor(station.layout, pieceId).y}`,
      cells: getPieceCells(station.layout, pieceId).map(([x, y]) => `${x},${y}`),
      rotation: piece.rotation,
      mirrored: piece.mirrored,
      entry: toOffsetKey(option.entry),
      exit: toOffsetKey(option.exit),
      traversableState: option.state,
      occupationState: occupation?.state ?? null,
      occupationVariant: occupation?.variant ?? null,
      signalIncluded: isSignalPieceType(piece.type),
    });

    const neighbor = getAdjacentTraversal(station, pieceId, option.entry);
    if (!neighbor) {
      break;
    }

    currentPieceId = neighbor.pieceId;
    currentExit = neighbor.exitToSource;
  }

  return {
    reservedOccupations: Object.values(reservedMap),
    signalPieceIds,
    debugSteps,
  };
}

function canUseLineblockForRoute(
  station: StationDocument,
  premainSignalPieceId: string,
  routeClass: RuntimeRouteClass,
) {
  const premainState = station.runtime.premainSignalStates[premainSignalPieceId];
  if (!premainState) {
    return false;
  }

  const lineblockPiece = station.layout.pieces[premainState.linkedLineblockPieceId];
  const lineblockState = lineblockPiece?.state.groups.lineblock?.state ?? 'default';

  if (routeClass === 'premain-to-platform') {
    return lineblockState === 'receiving' || lineblockState === 'receivingFree';
  }

  return lineblockState === 'sendingFree';
}

export type SignalRoutePlan = {
  nextSignalPieceId: string | null;
  clearsStation: boolean;
};

type NormalSignalAspect = 'default' | 'caution' | 'departure';

function getPlatformRouteKey(
  station: StationDocument,
  route: ActiveTrainRoute,
  tiles: TileCatalog,
) {
  const platformEndpointId =
    route.routeClass === 'platform-to-premain' ? route.sourcePieceId : route.targetPieceId;
  if (!station.layout.pieces[platformEndpointId]) {
    return null;
  }

  const platformStart = getPlatformTrackNeighbor(station, platformEndpointId);
  if (!platformStart) {
    return null;
  }

  const connectedPieces = new Set([platformEndpointId]);
  const visited = new Set<string>();
  const queue: RouteEndpointTraversal[] = [platformStart];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    const visitedKey = `${current.pieceId}:${toOffsetKey(current.entry)}`;
    if (visited.has(visitedKey)) {
      continue;
    }
    visited.add(visitedKey);

    const piece = station.layout.pieces[current.pieceId];
    if (!piece || isSignalPieceType(piece.type)) {
      continue;
    }

    connectedPieces.add(current.pieceId);
    if (isRouteControlPieceType(piece.type)) {
      continue;
    }

    getTraversalOptions(station, current.pieceId, tiles)
      .filter((option) => toOffsetKey(option.entry) === toOffsetKey(current.entry))
      .forEach((option) => {
        const neighbor = getNeighborTraversal(station, current.pieceId, option.exit);
        if (neighbor) {
          queue.push(neighbor);
        }
      });
  }

  return `${Array.from(connectedPieces).sort().join('|')}:${route.direction}`;
}

function getOrderedFacingSignals(station: StationDocument, route: ActiveTrainRoute) {
  const directionSign = normalizeDirection(route.direction);
  return Array.from(new Set(route.signalPieceIds))
    .filter((pieceId) => {
      const piece = station.layout.pieces[pieceId];
      return (
        piece?.state.groups.signal &&
        piece.type !== 'shuntSignal' &&
        getSignalFacingDirection(piece.type, piece.rotation) === route.direction
      );
    })
    .sort((leftId, rightId) => {
      const leftX = getPieceCenter(station.layout, leftId).x;
      const rightX = getPieceCenter(station.layout, rightId).x;
      return (leftX - rightX) * directionSign;
    });
}

export function buildSignalRoutePlans(
  station: StationDocument,
  routes: ActiveTrainRoute[],
  tiles: TileCatalog,
) {
  const cancellingRouteIds = new Set(
    Object.values(station.runtime.pendingActions)
      .filter((action) => action.type === 'route:cancel-normal' || action.type === 'route:cancel-shunt')
      .map((action) => action.payload.routeId)
      .filter((routeId): routeId is string => typeof routeId === 'string'),
  );
  const normalRoutes = routes.filter(
    (route) => route.routeType === 'normal' && !cancellingRouteIds.has(route.id),
  );
  const orderedSignalsByRoute = new Map<string, string[]>();
  const outboundStartByPlatform = new Map<string, string>();

  normalRoutes.forEach((route) => {
    const orderedSignals = getOrderedFacingSignals(station, route);
    orderedSignalsByRoute.set(route.id, orderedSignals);

    const platformKey = getPlatformRouteKey(station, route, tiles);
    if (route.routeClass === 'platform-to-premain' && platformKey && orderedSignals[0]) {
      outboundStartByPlatform.set(platformKey, orderedSignals[0]);
    }
  });

  const plans = new Map<string, SignalRoutePlan>();
  normalRoutes.forEach((route) => {
    const orderedSignals = orderedSignalsByRoute.get(route.id) ?? [];
    orderedSignals.forEach((pieceId, index) => {
      if (route.passedSignalPieceIds.includes(pieceId)) {
        return;
      }

      const nextSignalPieceId = orderedSignals[index + 1] ?? null;
      if (nextSignalPieceId) {
        plans.set(pieceId, { nextSignalPieceId, clearsStation: false });
        return;
      }

      const platformKey = getPlatformRouteKey(station, route, tiles);
      plans.set(pieceId, {
        nextSignalPieceId:
          route.routeClass === 'premain-to-platform' && platformKey
            ? (outboundStartByPlatform.get(platformKey) ?? null)
            : null,
        clearsStation: route.routeClass === 'platform-to-premain',
      });
    });
  });

  return plans;
}

function resolveSignalAspect(
  pieceId: string,
  plans: Map<string, SignalRoutePlan>,
  resolved: Map<string, NormalSignalAspect>,
  resolving: Set<string>,
): NormalSignalAspect {
  const existing = resolved.get(pieceId);
  if (existing) {
    return existing;
  }

  const plan = plans.get(pieceId);
  if (!plan) {
    return 'default';
  }

  if (plan.clearsStation) {
    resolved.set(pieceId, 'departure');
    return 'departure';
  }

  if (!plan.nextSignalPieceId || resolving.has(pieceId)) {
    resolved.set(pieceId, 'caution');
    return 'caution';
  }

  resolving.add(pieceId);
  const nextAspect = resolveSignalAspect(plan.nextSignalPieceId, plans, resolved, resolving);
  resolving.delete(pieceId);

  const aspect = nextAspect === 'default' ? 'caution' : 'departure';
  resolved.set(pieceId, aspect);
  return aspect;
}

type CrossoverBranchStatus = 'reserved' | 'occupied';

type CrossoverBranches = {
  top?: CrossoverBranchStatus;
  bottom?: CrossoverBranchStatus;
};

export function crossoverTraversalStatesConflict(leftState: string, rightState: string) {
  const getBranch = (state: string) => {
    if (state === 't') return 'top';
    if (state === 'b') return 'bottom';
    if (state === 'tlTtrAblTbr') return 'both';
    return 'diagonal';
  };
  const leftBranch = getBranch(leftState);
  const rightBranch = getBranch(rightState);

  return !(
    (leftBranch === 'top' && rightBranch === 'bottom') ||
    (leftBranch === 'bottom' && rightBranch === 'top')
  );
}

function getCrossoverBranches(occupation: ActiveTrainRouteOccupation): CrossoverBranches | null {
  if (occupation.state === 't') {
    return { top: occupation.variant === 'occupied' ? 'occupied' : 'reserved' };
  }

  if (occupation.state === 'b') {
    return { bottom: occupation.variant === 'occupied' ? 'occupied' : 'reserved' };
  }

  if (occupation.state !== 'tlTtrAblTbr') {
    return null;
  }

  if (occupation.variant === 'topOccupiedBottomReserved') {
    return { top: 'occupied', bottom: 'reserved' };
  }

  if (occupation.variant === 'topReservedBottomOccupied') {
    return { top: 'reserved', bottom: 'occupied' };
  }

  const status = occupation.variant === 'occupied' ? 'occupied' : 'reserved';
  return { top: status, bottom: status };
}

function mergeBranchStatus(
  current: CrossoverBranchStatus | undefined,
  incoming: CrossoverBranchStatus | undefined,
) {
  if (current === 'occupied' || incoming === 'occupied') {
    return 'occupied' as const;
  }

  return current ?? incoming;
}

function mergeCrossoverOccupations(
  current: ActiveTrainRouteOccupation,
  incoming: ActiveTrainRouteOccupation,
) {
  const currentBranches = getCrossoverBranches(current);
  const incomingBranches = getCrossoverBranches(incoming);
  if (!currentBranches || !incomingBranches) {
    return incoming;
  }

  const top = mergeBranchStatus(currentBranches.top, incomingBranches.top);
  const bottom = mergeBranchStatus(currentBranches.bottom, incomingBranches.bottom);

  if (top && bottom) {
    const variant =
      top === 'occupied' && bottom === 'occupied'
        ? 'occupied'
        : top === 'occupied'
          ? 'topOccupiedBottomReserved'
          : bottom === 'occupied'
            ? 'topReservedBottomOccupied'
            : 'reserved';
    return {
      pieceId: incoming.pieceId,
      state: 'tlTtrAblTbr',
      variant,
    };
  }

  return {
    pieceId: incoming.pieceId,
    state: top ? 't' : 'b',
    variant: top ?? bottom ?? 'reserved',
  };
}

function containsOccupiedBranch(occupation: ActiveTrainRouteOccupation) {
  return (
    occupation.state === 'occupied' ||
    occupation.variant === 'occupied' ||
    occupation.variant.includes('Occupied')
  );
}

function isTraversalBlockedByOccupation(
  station: StationDocument,
  pieceId: string,
  _requiredOccupationState?: string,
) {
  const piece = station.layout.pieces[pieceId];
  const selection = piece?.state.groups.occupation;
  if (!piece || !selection) {
    return false;
  }

  const current: ActiveTrainRouteOccupation = {
    pieceId,
    state: selection.state,
    variant: selection.variant,
  };
  if (!containsOccupiedBranch(current)) {
    return false;
  }

  if (piece.type !== 'crossoverSwitch') {
    return true;
  }

  const required: ActiveTrainRouteOccupation = {
    pieceId,
    state: _requiredOccupationState ?? 'reserved',
    variant: 'reserved',
  };
  const currentBranches = getCrossoverBranches(current);
  const requiredBranches = getCrossoverBranches(required);
  if (!currentBranches || !requiredBranches) {
    return true;
  }

  return (
    (requiredBranches.top !== undefined && currentBranches.top === 'occupied') ||
    (requiredBranches.bottom !== undefined && currentBranches.bottom === 'occupied')
  );
}

export function applyActiveRouteVisualState(station: StationDocument, tiles: TileCatalog) {
  const pieces = station.layout.pieces;

  Object.values(pieces).forEach((piece) => {
    if (piece.state.groups.button) {
      piece.state.groups.button = {
        state: 'default',
        variant: 'normal',
      };
    }

    if (piece.state.groups.signal) {
      piece.state.groups.signal = {
        state: 'default',
        variant: 'normal',
      };
    }

    if (piece.state.groups.occupation) {
      piece.state.groups.occupation = {
        state: 'default',
        variant: 'normal',
      };
    }
  });

  const routes = Object.values(station.runtime.activeTrainRoutes);
  const mergedOccupations = new Map<string, ActiveTrainRouteOccupation>();
  routes.forEach((route) => {
    route.reservedOccupations.forEach((occupation) => {
      const piece = pieces[occupation.pieceId];
      if (!piece?.state.groups.occupation) {
        return;
      }

      const current = mergedOccupations.get(occupation.pieceId);
      mergedOccupations.set(
        occupation.pieceId,
        current && piece.type === 'crossoverSwitch'
          ? mergeCrossoverOccupations(current, occupation)
          : occupation,
      );
    });
  });

  mergedOccupations.forEach((occupation) => {
    const piece = pieces[occupation.pieceId];
    if (piece?.state.groups.occupation) {
      piece.state.groups.occupation = {
        state: occupation.state,
        variant: occupation.variant,
      };
    }
  });

  const signalPlans = buildSignalRoutePlans(station, routes, tiles);
  const resolvedAspects = new Map<string, NormalSignalAspect>();
  signalPlans.forEach((_, pieceId) => {
    const piece = pieces[pieceId];
    if (!piece?.state.groups.signal) {
      return;
    }

    piece.state.groups.signal = {
      state: resolveSignalAspect(pieceId, signalPlans, resolvedAspects, new Set()),
      variant: 'normal',
    };
  });

  routes
    .filter((route) => route.routeType === 'shunt')
    .forEach((route) => {
      const cancelQueued = Object.values(station.runtime.pendingActions).some(
        (action) =>
          (action.type === 'route:cancel-normal' || action.type === 'route:cancel-shunt') &&
          action.payload.routeId === route.id,
      );
      if (cancelQueued) {
        return;
      }
      route.signalPieceIds.forEach((pieceId) => {
        const piece = pieces[pieceId];
        if (
          route.passedSignalPieceIds.includes(pieceId) ||
          !piece?.state.groups.signal ||
          piece.type === 'premainSignal' ||
          piece.type === 'premainSignalNoOcp' ||
          getSignalFacingDirection(piece.type, piece.rotation) !== route.direction
        ) {
          return;
        }

        piece.state.groups.signal = {
          state: 'shunt',
          variant: 'normal',
        };
      });
    });
}

export function applyTrainOccupationVisualState(
  station: StationDocument,
  occupiedSensors: Array<{ pieceId: string; occupationState: string }>,
) {
  occupiedSensors.forEach((sensor) => {
    const piece = station.layout.pieces[sensor.pieceId];
    if (!piece?.state.groups.occupation) {
      return;
    }

    const incoming: ActiveTrainRouteOccupation = {
      pieceId: sensor.pieceId,
      state: sensor.occupationState,
      variant: sensor.occupationState === 'occupied' ? 'normal' : 'occupied',
    };
    const current: ActiveTrainRouteOccupation = {
      pieceId: sensor.pieceId,
      state: piece.state.groups.occupation.state,
      variant: piece.state.groups.occupation.variant,
    };
    const occupation =
      piece.type === 'crossoverSwitch' ? mergeCrossoverOccupations(current, incoming) : incoming;

    piece.state.groups.occupation = {
      state: occupation.state,
      variant: occupation.variant,
    };
  });
}

export function buildRouteFromSelection(
  station: StationDocument,
  sourcePieceId: string,
  targetPieceId: string,
  tiles: TileCatalog,
  routeType: RuntimeRouteType = 'normal',
  validateRuntimeAvailability = true,
): StationRouteBuildResult {
  const sourcePiece = station.layout.pieces[sourcePieceId];
  const targetPiece = station.layout.pieces[targetPieceId];

  if (!sourcePiece || !targetPiece) {
    throw new Error('Route endpoints were not found.');
  }

  const routeClass: RuntimeRouteClass =
    routeType === 'shunt'
      ? 'shunt'
      : isPremainSignalPieceType(sourcePiece.type)
        ? 'premain-to-platform'
        : 'platform-to-premain';
  const direction = getRouteDirection(station, sourcePieceId, targetPieceId);
  const directionSign = normalizeDirection(direction);

  if (
    validateRuntimeAvailability &&
    routeClass === 'premain-to-platform' &&
    !canUseLineblockForRoute(station, sourcePieceId, routeClass)
  ) {
    throw new Error(
      'The linked lineblock does not currently allow an inbound route from this premain signal.',
    );
  }

  const shuntSource =
    routeType === 'shunt' ? getShuntSourceTraversal(station, sourcePieceId, directionSign) : null;
  const startTraversal =
    routeType === 'shunt'
      ? shuntSource?.traversal
      : routeClass === 'premain-to-platform'
        ? {
            pieceId: sourcePieceId,
            entry: direction === 'left-to-right' ? { x: -1, y: 0 } : { x: 1, y: 0 },
          }
        : getDepartureSignalTraversal(station, sourcePieceId);

  const targetTraversal =
    routeType === 'shunt' && targetPiece.type !== 'departureButton'
      ? getInlineTargetTraversal(station, targetPieceId, sourcePieceId)
      : routeClass === 'premain-to-platform' || routeType === 'shunt'
        ? getArrivalTargetTraversal(station, targetPieceId)
        : getInlineTargetTraversal(station, targetPieceId, sourcePieceId);

  if (!startTraversal || !targetTraversal) {
    throw new Error('Unable to derive route endpoints for the selected pieces.');
  }

  const queue: RouteSearchState[] = [
    {
      pieceId: startTraversal.pieceId,
      entry: startTraversal.entry,
      cost: 0,
      visitedPieceIds: [],
      reservedOccupations: {},
      signalPieceIds: shuntSource?.sourceSignalPieceId ? [shuntSource.sourceSignalPieceId] : [],
      debugSteps: [],
    },
  ];

  const targetKey = `${targetTraversal.pieceId}:${toOffsetKey(targetTraversal.entry)}`;

  while (queue.length > 0) {
    queue.sort((left, right) => left.cost - right.cost);
    const current = queue.shift();
    if (!current) {
      break;
    }

    const currentPiece = station.layout.pieces[current.pieceId];
    if (!currentPiece) {
      continue;
    }

    const currentKey = `${current.pieceId}:${toOffsetKey(current.entry)}`;
    if (currentKey === targetKey) {
      const piece = station.layout.pieces[current.pieceId];
      const targetContribution = getTargetPieceContribution(
        station,
        current.pieceId,
        current.entry,
        directionSign,
        tiles,
      );
      const reservedOccupationsMap = { ...current.reservedOccupations };
      pushReservation(
        station,
        reservedOccupationsMap,
        current.pieceId,
        targetContribution.occupation,
      );

      let signalPieceIds = Array.from(
        new Set(
          targetContribution.includeSignal
            ? [...current.signalPieceIds, current.pieceId]
            : current.signalPieceIds,
        ),
      );
      const debugSteps =
        targetContribution.occupation || targetContribution.includeSignal
          ? [
              ...current.debugSteps,
              {
                pieceId: current.pieceId,
                pieceType: piece?.type ?? 'unknown',
                anchor: piece
                  ? `${getPieceAnchor(station.layout, current.pieceId).x},${getPieceAnchor(station.layout, current.pieceId).y}`
                  : '-',
                cells: piece
                  ? getPieceCells(station.layout, current.pieceId).map(([x, y]) => `${x},${y}`)
                  : [],
                rotation: piece?.rotation ?? 0,
                mirrored: piece?.mirrored ?? false,
                entry: toOffsetKey(current.entry),
                exit: 'target',
                traversableState: targetContribution.occupation?.state ?? 'none',
                occupationState: targetContribution.occupation?.state ?? null,
                occupationVariant: targetContribution.occupation?.variant ?? null,
                signalIncluded: targetContribution.includeSignal,
              },
            ]
          : current.debugSteps;
      const extraReservedMap = { ...reservedOccupationsMap };
      let extraDebugSteps = [...debugSteps];

      if (routeClass === 'platform-to-premain' && targetContribution.exit) {
        const tailStart = getNeighborTraversal(station, current.pieceId, targetContribution.exit);
        if (tailStart) {
          const tail = traceForwardToBoundary(
            station,
            tailStart.pieceId,
            tailStart.entry,
            directionSign,
            tiles,
          );
          tail.reservedOccupations.forEach((occupation) => {
            pushReservation(station, extraReservedMap, occupation.pieceId, occupation);
          });
          signalPieceIds = Array.from(new Set([...signalPieceIds, ...tail.signalPieceIds]));
          extraDebugSteps = [...extraDebugSteps, ...tail.debugSteps];
        }
      }

      if (routeClass === 'premain-to-platform') {
        const approachStart = getAdjacentTraversal(station, sourcePieceId, startTraversal.entry);
        if (approachStart) {
          const approach = traceBackwardToBoundary(
            station,
            approachStart.pieceId,
            approachStart.exitToSource,
            directionSign,
            tiles,
          );
          approach.reservedOccupations.forEach((occupation) => {
            pushReservation(station, extraReservedMap, occupation.pieceId, occupation);
          });
          signalPieceIds = Array.from(new Set([...signalPieceIds, ...approach.signalPieceIds]));
          extraDebugSteps = [...approach.debugSteps, ...extraDebugSteps];
        }

        const platformStart = getAdjacentTraversal(station, targetPieceId, {
          x: directionSign,
          y: 0,
        });
        if (platformStart) {
          const platform = tracePlatformToNextControl(
            station,
            platformStart.pieceId,
            platformStart.entryFromSource,
            directionSign,
            tiles,
          );
          platform.reservedOccupations.forEach((occupation) => {
            pushReservation(station, extraReservedMap, occupation.pieceId, occupation);
          });
          extraDebugSteps = [...extraDebugSteps, ...platform.debugSteps];
        }
      }

      if (routeType === 'shunt') {
        const platformStart =
          targetPiece.type === 'departureButton'
            ? getAdjacentTraversal(station, targetPieceId, { x: directionSign, y: 0 })
            : targetContribution.exit
              ? getAdjacentTraversal(station, current.pieceId, targetContribution.exit)
              : null;

        if (platformStart) {
          const platform = tracePlatformToNextControl(
            station,
            platformStart.pieceId,
            platformStart.entryFromSource,
            directionSign,
            tiles,
          );
          platform.reservedOccupations.forEach((occupation) => {
            pushReservation(station, extraReservedMap, occupation.pieceId, occupation);
          });
          extraDebugSteps = [...extraDebugSteps, ...platform.debugSteps];
        }
      }

      const reservedOccupations = Object.values(extraReservedMap);
      const path = buildOrderedRoutePath(
        station,
        sourcePieceId,
        targetPieceId,
        direction,
        extraDebugSteps,
        reservedOccupations,
      );
      const targetPlatformDepartureSignalPieceId =
        routeType === 'normal'
          ? findAdjacentDepartureSignal(
              station,
              routeClass === 'premain-to-platform' ? targetPieceId : sourcePieceId,
            )
          : null;

      if (validateRuntimeAvailability && routeClass === 'platform-to-premain') {
        const premainSignalPieceId = signalPieceIds.find(
          (pieceId) => station.layout.pieces[pieceId]?.type === 'premainSignal',
        );
        if (
          !premainSignalPieceId ||
          !canUseLineblockForRoute(station, premainSignalPieceId, routeClass)
        ) {
          throw new Error(
            'The linked lineblock does not currently allow an outbound route in this direction.',
          );
        }
      }

      const occupiedStep = extraDebugSteps.find(
        (step) =>
          step.occupationState &&
          isTraversalBlockedByOccupation(station, step.pieceId, step.occupationState),
      );
      if (validateRuntimeAvailability && occupiedStep) {
        continue;
      }

      const fixedSwitchStep = extraDebugSteps.find(
        (step) =>
          !isSwitchTraversalAllowedByButtonLocks(station, step.pieceId, step.traversableState),
      );
      if (validateRuntimeAvailability && fixedSwitchStep) {
        continue;
      }

      return {
        routeType,
        routeClass,
        direction,
        sourcePieceId,
        targetPieceId,
        reservedOccupations,
        signalPieceIds,
        targetPlatformDepartureSignalPieceId,
        path,
        debugSteps: extraDebugSteps,
      };
    }

    if (current.visitedPieceIds.includes(current.pieceId)) {
      continue;
    }

    const options = getSortedMatchingTraversalOptions(
      station,
      current.pieceId,
      current.entry,
      directionSign,
      tiles,
    ).filter(
      (option) =>
        !validateRuntimeAvailability ||
        (!isTraversalBlockedByOccupation(station, current.pieceId, option.occupationState) &&
          isSwitchTraversalAllowedByButtonLocks(station, current.pieceId, option.state)),
    );

    options.forEach((option) => {
      const nextReserved = { ...current.reservedOccupations };
      if (isOccupiablePiece(station, current.pieceId, tiles)) {
        pushReservation(station, nextReserved, current.pieceId, {
          pieceId: current.pieceId,
          state: option.occupationState,
          variant: option.occupationVariant,
        });
      }

      const nextSignals = isSignalPieceType(currentPiece.type)
        ? [...current.signalPieceIds, current.pieceId]
        : current.signalPieceIds;
      const nextDebugSteps = [
        ...current.debugSteps,
        {
          pieceId: current.pieceId,
          pieceType: currentPiece.type,
          anchor: `${getPieceAnchor(station.layout, current.pieceId).x},${getPieceAnchor(station.layout, current.pieceId).y}`,
          cells: getPieceCells(station.layout, current.pieceId).map(([x, y]) => `${x},${y}`),
          rotation: currentPiece.rotation,
          mirrored: currentPiece.mirrored,
          entry: toOffsetKey(option.entry),
          exit: toOffsetKey(option.exit),
          traversableState: option.state,
          occupationState: isOccupiablePiece(station, current.pieceId, tiles)
            ? option.occupationState
            : null,
          occupationVariant: isOccupiablePiece(station, current.pieceId, tiles)
            ? option.occupationVariant
            : null,
          signalIncluded: isSignalPieceType(currentPiece.type),
        },
      ];

      const neighbor = getNeighborTraversal(station, current.pieceId, option.exit);
      if (!neighbor) {
        return;
      }

      queue.push({
        pieceId: neighbor.pieceId,
        entry: neighbor.entry,
        cost: current.cost + getTraversalSearchCost(currentPiece.type, option.state),
        visitedPieceIds: [...current.visitedPieceIds, current.pieceId],
        reservedOccupations: nextReserved,
        signalPieceIds: nextSignals,
        debugSteps: nextDebugSteps,
      });
    });
  }

  console.log(
    [
      `[route-debug-fail] ${station.sessionId}/${station.stationId}`,
      `  routeType=${routeType} routeClass=${routeClass} direction=${direction}`,
      `  source=${sourcePieceId} (${sourcePiece.type})`,
      `  target=${targetPieceId} (${targetPiece.type})`,
      `  startTraversal=${startTraversal.pieceId}:${toOffsetKey(startTraversal.entry)}`,
      `  targetTraversal=${targetTraversal.pieceId}:${toOffsetKey(targetTraversal.entry)}`,
    ].join('\n'),
  );

  throw new Error('No valid route could be found for the selected endpoints.');
}
