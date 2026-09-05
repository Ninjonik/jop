import { randomUUID } from 'crypto';

import { stateGroups, tiles } from '@/app/data/tiles';
import type {
  ActiveTrainRoute,
  LineblockActionCommand,
  LineblockActionType,
  MockTrain,
  PendingAction,
  PrivolavaciaInteractCommand,
  PlaceTemplateDocument,
  RobloxPhysicalSnapshot,
  RouteInteractCommand,
  RuntimeRouteSelection,
  RuntimeRouteType,
  RobloxResolvedSignalAspect,
  RobloxResolvedSignalFamily,
  SessionDocument,
  SessionLineblockLink,
  SessionSchemaDocument,
  StationActionLogDocument,
  StationDocument,
  SwitchSetPositionCommand,
  TrainDirection,
  TrainMovementStep,
} from '@/lib/station/domain';
import {
  deserializeStationLayout,
  normalizeStationLayout,
  serializeStationLayout,
} from '@/lib/station/domain';
import {
  createInitialStationLayout,
  getPrivolavaciaSignalLinksFromLayout,
  getLineblockPremainLinksFromLayout,
  getPieceAnchor,
  getPieceCells,
  isLineblockPieceType,
  isPrivolavaciaCounterPieceType,
  isPrivolavaciaSignalPieceType,
  parseCellRef,
  transformPoint,
  placePieceAt,
} from '@/lib/station/layout';
import {
  applyActiveRouteVisualState,
  applyTrainOccupationVisualState,
  buildSignalRoutePlans,
  buildRouteFromSelection,
  crossoverTraversalStatesConflict,
  getTraversableNeighborPieceIds,
} from '@/lib/station/routes';
import {
  getConnectedSwitchControl,
  getDefaultSwitchMotorPositions,
  getMotorPositionsForTraversableState,
  getRequiredSwitchMotorPositions,
  getTraversableStateForMotorPositions,
  isCrossoverSwitchType,
  isDivergingSwitchTraversal,
  isOccupationVisibleForSwitchAlignment,
  isPhysicalSwitchType,
  isSwitchTraversalAllowedByButtonLocks,
  type SwitchControlSlot,
  type SwitchMotorPosition,
} from '@/lib/station/switches';
import { getInitialGroupSelections, resolveComponentStyles } from '@/lib/station/tile-state';

import { placeTemplateRepository } from '../repositories/place-template-repository';
import { robloxRuntimeStateRepository } from '../repositories/roblox-runtime-state-repository';
import { robloxRuntimeUpdateRepository } from '../repositories/roblox-runtime-update-repository';
import { sessionRepository } from '../repositories/session-repository';
import { stationActionLogRepository } from '../repositories/station-action-log-repository';
import { stationRepository } from '../repositories/station-repository';
import {
  initializeRobloxRuntimeState,
  notifyRuntimeInterpreter,
} from '../roblox/runtime-interpreter';
import { printDebugBlock } from '../debug-log';
import { buildActionDebugLines } from '@/lib/station/debug';

function nowIso() {
  return new Date().toISOString();
}

const ROBLOX_SESSION_HEARTBEAT_TIMEOUT_MS = 60_000;

function createSessionId(prefix: 'mock' | 'session' = 'mock') {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function logRouteBuildDebug(
  station: StationDocument,
  builtRoute: ReturnType<typeof buildRouteFromSelection>,
) {
  const projectedStation = structuredClone(station);
  projectedStation.runtime.activeTrainRoutes.__debug__ = {
    id: '__debug__',
    routeType: builtRoute.routeType,
    sourcePieceId: builtRoute.sourcePieceId,
    targetPieceId: builtRoute.targetPieceId,
    routeClass: builtRoute.routeClass,
    direction: builtRoute.direction,
    reservedOccupations: builtRoute.reservedOccupations,
    signalPieceIds: builtRoute.signalPieceIds,
    targetPlatformDepartureSignalPieceId: builtRoute.targetPlatformDepartureSignalPieceId,
    path: builtRoute.path,
    passedSignalPieceIds: [],
    createdAt: nowIso(),
  };
  applyActiveRouteVisualState(projectedStation, tiles);

  const lines = [
    `[route-debug] ${station.sessionId}/${station.stationId}`,
    `  routeType=${builtRoute.routeType} routeClass=${builtRoute.routeClass} direction=${builtRoute.direction}`,
    `  source=${builtRoute.sourcePieceId} target=${builtRoute.targetPieceId}`,
    `  movementPath=${builtRoute.path.map((step) => step.pieceId).join(' -> ') || 'none'}`,
    `  targetPlatformDepartureSignal=${builtRoute.targetPlatformDepartureSignalPieceId ?? 'none'}`,
    `  signalPieceIds=${builtRoute.signalPieceIds.join(', ') || 'none'}`,
    `  reservedOccupations=${
      builtRoute.reservedOccupations
        .map((entry) => `${entry.pieceId}:${entry.state}:${entry.variant}`)
        .join(', ') || 'none'
    }`,
    '  steps:',
    ...builtRoute.debugSteps.map(
      (step, index) =>
        `    ${index + 1}. ${step.pieceId} (${step.pieceType}) anchor=${step.anchor} cells=[${step.cells.join(' | ')}] rotation=${step.rotation} mirrored=${step.mirrored} entry=${step.entry} exit=${step.exit} traversable=${step.traversableState} occupation=${step.occupationState ?? '-'}:${step.occupationVariant ?? '-'} signal=${step.signalIncluded}`,
    ),
    '  applied-piece-states:',
    ...builtRoute.reservedOccupations.map((entry) => {
      const piece = station.layout.pieces[entry.pieceId];
      const projectedPiece = projectedStation.layout.pieces[entry.pieceId];
      const projectedStyles = piece
        ? Object.entries(
            resolveComponentStyles(
              tiles[piece.type],
              projectedPiece?.state.groups ?? {},
              stateGroups,
            ),
          )
            .filter(([styleKey]) => styleKey.startsWith('--occupation-'))
            .map(([styleKey, value]) => `${styleKey}=${value}`)
            .join(', ')
        : 'n/a';

      return `    ${entry.pieceId} (${piece?.type ?? 'unknown'}) currentOccupation=${piece?.state.groups.occupation?.state ?? '-'}:${piece?.state.groups.occupation?.variant ?? '-'} targetOccupation=${entry.state}:${entry.variant} projectedOccupation=${projectedPiece?.state.groups.occupation?.state ?? '-'}:${projectedPiece?.state.groups.occupation?.variant ?? '-'} projectedStyles=${projectedStyles || 'none'}`;
    }),
  ];

  console.log(lines.join('\n'));
}

function createStationDocument(
  sessionId: string,
  stationId: string,
  layoutOverride?: StationDocument['layout'],
): StationDocument {
  const createdAt = nowIso();
  const layout = layoutOverride ?? serializeStationLayout(createDemoStationLayout());

  return {
    _id: randomUUID(),
    sessionId,
    stationId,
    revision: 0,
    layout,
    runtime: {
      pendingActions: {},
      lineblockPremainLinks: {},
      premainSignalStates: {},
      privolavaciaSelection: null,
      activePrivolavaciaSignals: {},
      routeSelection: null,
      activeTrainRoutes: {},
      switchAlignments: {},
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function createDemoStationLayout() {
  const layout = createInitialStationLayout(8, 5, tiles, stateGroups);

  placePieceAt(layout, 'track', 0, 2, tiles, stateGroups);
  placePieceAt(layout, 'track', 1, 2, tiles, stateGroups);
  placePieceAt(layout, 'switchButton', 2, 1, tiles, stateGroups);
  const switchId = placePieceAt(layout, 'singleSwitch', 4, 1, tiles, stateGroups);
  placePieceAt(layout, 'track', 6, 2, tiles, stateGroups);
  placePieceAt(layout, 'entrySignal', 7, 2, tiles, stateGroups);

  const switchButtonId = Object.entries(layout.pieces).find(
    ([, piece]) => piece.type === 'switchButton',
  )?.[0];

  if (switchButtonId) {
    layout.connections[switchButtonId] = `${switchId}:main`;
    layout.connections[`${switchId}:main`] = switchButtonId;
  }

  return layout;
}

function bumpRevision(station: StationDocument) {
  station.revision += 1;
  station.updatedAt = nowIso();
}

async function buildRobloxPhysicalSnapshot(sessionId: string): Promise<RobloxPhysicalSnapshot> {
  const [rawSession, rawStations] = await Promise.all([
    sessionRepository.findById(sessionId),
    stationRepository.listBySessionId(sessionId),
  ]);
  if (!rawSession) {
    throw new Error('Session not found.');
  }
  const session = ensureSessionRuntimeState(rawSession);
  if (session.interpreter.kind !== 'roblox') {
    throw new Error('The requested session is not a Roblox session.');
  }

  const stations = rawStations.map((station) => {
    ensureStationRuntimeState(station);
    applySessionTrainOccupations(station, session);
    const resolvedSignalAspects = buildResolvedRobloxSignalAspects(station);
    const activeLevelCrossingPieceIds = getActiveLevelCrossingPieceIds(station, session);
    return {
      stationId: station.stationId,
      revision: station.revision,
      pieces: Object.fromEntries(
        Object.entries(station.layout.pieces).map(([pieceId, piece]) => [
          pieceId,
          {
            type: piece.type,
            groups: piece.state.groups,
            texts: piece.state.texts,
            switchAlignment: station.runtime.switchAlignments[pieceId] ?? null,
            resolvedSignalFamily: resolvedSignalAspects.get(pieceId)?.family ?? null,
            resolvedSignalAspect: resolvedSignalAspects.get(pieceId)?.aspect ?? null,
            levelCrossingActive: activeLevelCrossingPieceIds.has(pieceId),
          },
        ]),
      ),
    };
  });

  return {
    protocolVersion: 1,
    sessionId,
    placeId: session.interpreter.placeId,
    generatedAt: nowIso(),
    stations,
  };
}

function isTrackCrossingPieceType(pieceType: string) {
  return pieceType === 'trackCrossing' || pieceType === 'trackCrossingNoOcp';
}

function getActiveLevelCrossingPieceIds(station: StationDocument, session: SessionDocument) {
  const occupiedPieceIds = new Set<string>();
  Object.values(session.runtime.trains).forEach((train) => {
    train.occupiedSensors.forEach((sensor) => {
      if (sensor.stationId === station.stationId) occupiedPieceIds.add(sensor.pieceId);
    });
  });
  Object.values(session.runtime.physicalOccupations).forEach((occupation) => {
    if (occupation.occupied && occupation.stationId === station.stationId) {
      occupiedPieceIds.add(occupation.pieceId);
    }
  });
  const reservedCrossingPieceIds = new Set(
    Object.values(station.runtime.activeTrainRoutes).flatMap((route) =>
      route.reservedOccupations.map((occupation) => occupation.pieceId),
    ),
  );

  const activeColumns = new Set<number>();
  Object.entries(station.layout.pieces).forEach(([pieceId, piece]) => {
    if (!isTrackCrossingPieceType(piece.type)) return;

    const range = piece.levelCrossingActivationRange;
    if (range === undefined) {
      // Station crossings close as soon as a normal or shunt route reserves
      // their sensor, and remain closed while that sensor is occupied.
      if (reservedCrossingPieceIds.has(pieceId) || occupiedPieceIds.has(pieceId)) {
        activeColumns.add(getPieceAnchor(station.layout, pieceId).x);
      }
      return;
    }

    const searchedPieceIds = new Set([pieceId]);
    let frontier = [pieceId];
    for (let distance = 0; distance < range; distance += 1) {
      frontier = frontier.flatMap((currentPieceId) =>
        getTraversableNeighborPieceIds(station, currentPieceId, tiles),
      ).filter((neighborPieceId) => {
        if (searchedPieceIds.has(neighborPieceId)) return false;
        searchedPieceIds.add(neighborPieceId);
        return true;
      });
    }

    if ([...searchedPieceIds].some((candidatePieceId) => occupiedPieceIds.has(candidatePieceId))) {
      activeColumns.add(getPieceAnchor(station.layout, pieceId).x);
    }
  });

  return new Set(
    Object.entries(station.layout.pieces)
      .filter(([, piece]) => isTrackCrossingPieceType(piece.type))
      .filter(([pieceId]) => activeColumns.has(getPieceAnchor(station.layout, pieceId).x))
      .map(([pieceId]) => pieceId),
  );
}

async function saveStation(station: StationDocument, options?: { skipRuntimeNotify?: boolean }) {
  await stationRepository.save(station);
  if (!options?.skipRuntimeNotify) {
    void notifyRuntimeInterpreter(station.sessionId, () =>
      buildRobloxPhysicalSnapshot(station.sessionId),
    );
  }
}

async function saveSession(session: SessionDocument, options?: { skipRuntimeNotify?: boolean }) {
  await sessionRepository.save(session);
  if (!options?.skipRuntimeNotify) {
    void notifyRuntimeInterpreter(session._id, () => buildRobloxPhysicalSnapshot(session._id));
  }
}

function normalizeRouteSelection(
  selection: StationDocument['runtime']['routeSelection'],
): StationDocument['runtime']['routeSelection'] {
  if (!selection) {
    return null;
  }

  return {
    ...selection,
    sourceControl:
      selection.sourceControl ??
      (selection.sourcePieceType === 'departureButton' && selection.routeType === 'shunt'
        ? 'shunt'
        : 'normal'),
  };
}

function normalizeRouteControl(
  routeType: RuntimeRouteType,
  pieceType: string | undefined,
  control: 'normal' | 'shunt' | undefined,
) {
  if (control) {
    return control;
  }

  if (pieceType === 'departureButton') {
    return routeType === 'shunt' ? 'shunt' : 'normal';
  }

  return undefined;
}

function normalizeLineblockDefaultFlow(
  value: string | undefined,
): SessionLineblockLink['defaultFlow'] {
  if (value === 'a-receiving' || value === 'b-receiving') {
    return value;
  }
  return 'neutral';
}

function ensureStationRuntimeState(station: StationDocument) {
  station.layout = normalizeStationLayout(station.layout);

  const existingRuntime = station.runtime ?? {
    pendingActions: {},
    lineblockPremainLinks: {},
    premainSignalStates: {},
  };

  station.runtime = {
    pendingActions: existingRuntime.pendingActions ?? {},
    lineblockPremainLinks: getLineblockPremainLinksFromLayout(station.layout),
    premainSignalStates: existingRuntime.premainSignalStates ?? {},
    privolavaciaSelection: existingRuntime.privolavaciaSelection ?? null,
    activePrivolavaciaSignals: existingRuntime.activePrivolavaciaSignals ?? {},
    routeSelection: normalizeRouteSelection(existingRuntime.routeSelection ?? null),
    activeTrainRoutes: existingRuntime.activeTrainRoutes ?? {},
    switchAlignments: existingRuntime.switchAlignments ?? {},
  };

  Object.entries(station.runtime.switchAlignments).forEach(([pieceId, alignment]) => {
    const piece = station.layout.pieces[pieceId];
    alignment.motorPositions ??= piece
      ? getMotorPositionsForTraversableState(piece.type, alignment.traversableState)
      : {};
  });

  Object.values(station.runtime.activeTrainRoutes).forEach((route) => {
    route.path ??= [];
    route.passedSignalPieceIds ??= [];
    route.sourceControl = normalizeRouteControl(
      route.routeType,
      station.layout.pieces[route.sourcePieceId]?.type,
      route.sourceControl,
    );
    route.targetControl = normalizeRouteControl(
      route.routeType,
      station.layout.pieces[route.targetPieceId]?.type,
      route.targetControl,
    );
  });

  syncPremainAvailability(station);
  applyRuntimeState(station);

  return station;
}

function getLineblockVisualState(station: StationDocument, pieceId: string) {
  return station.layout.pieces[pieceId]?.state.groups.lineblock?.state ?? 'default';
}

function setLineblockVisualState(station: StationDocument, pieceId: string, state: string) {
  const piece = station.layout.pieces[pieceId];
  if (!piece) {
    throw new Error(`Lineblock piece "${pieceId}" was not found.`);
  }

  piece.state.groups.lineblock = {
    state,
    variant: 'normal',
  };
}

function applyLineblockDefaultFlowToStations(
  defaultFlow: SessionLineblockLink['defaultFlow'],
  stationA: StationDocument,
  pieceAId: string,
  stationB: StationDocument,
  pieceBId: string,
) {
  if (defaultFlow === 'a-receiving') {
    setLineblockVisualState(stationA, pieceAId, 'receivingFree');
    setLineblockVisualState(stationB, pieceBId, 'sendingFree');
    return;
  }

  if (defaultFlow === 'b-receiving') {
    setLineblockVisualState(stationA, pieceAId, 'sendingFree');
    setLineblockVisualState(stationB, pieceBId, 'receivingFree');
    return;
  }

  setLineblockVisualState(stationA, pieceAId, 'default');
  setLineblockVisualState(stationB, pieceBId, 'default');
}

function syncPremainAvailability(station: StationDocument) {
  if (!station.runtime) {
    station.runtime = {
      pendingActions: {},
      lineblockPremainLinks: getLineblockPremainLinksFromLayout(station.layout),
      premainSignalStates: {},
      privolavaciaSelection: null,
      activePrivolavaciaSignals: {},
      routeSelection: null,
      activeTrainRoutes: {},
      switchAlignments: {},
    };
  }

  const nextStates: StationDocument['runtime']['premainSignalStates'] = {};

  Object.values(station.runtime.lineblockPremainLinks).forEach((link) => {
    nextStates[link.premainSignalPieceId] = {
      linkedLineblockPieceId: link.lineblockPieceId,
      canBuildPath: getLineblockVisualState(station, link.lineblockPieceId) === 'sendingFree',
    };
  });

  station.runtime.premainSignalStates = nextStates;
}

function applyRouteSelectionVisualState(
  station: StationDocument,
  selection: RuntimeRouteSelection,
) {
  const piece = station.layout.pieces[selection.sourcePieceId];
  if (!piece) {
    return;
  }

  if (piece.state.groups.button) {
    piece.state.groups.button = {
      state: getButtonVisualState(
        piece.type,
        selection.routeType,
        selection.sourcePieceType === 'departureButton' ? selection.sourceControl : null,
        null,
      ),
      variant: 'blinking',
    };
  }
}

function applyPendingRouteVisualState(station: StationDocument, action: PendingAction) {
  const sourcePieceId =
    typeof action.payload.sourcePieceId === 'string' ? action.payload.sourcePieceId : null;
  const targetPieceId =
    typeof action.payload.targetPieceId === 'string' ? action.payload.targetPieceId : null;

  if (!sourcePieceId || !targetPieceId) {
    return;
  }

  [sourcePieceId, targetPieceId].forEach((pieceId) => {
    const piece = station.layout.pieces[pieceId];
    if (!piece) {
      return;
    }

    if (piece.state.groups.button) {
      const controlKey = pieceId === sourcePieceId ? 'sourceControl' : 'targetControl';
      const explicitControl =
        action.payload[controlKey] === 'normal' || action.payload[controlKey] === 'shunt'
          ? action.payload[controlKey]
          : null;
      piece.state.groups.button = {
        state: getButtonVisualState(
          piece.type,
          action.payload.routeType === 'shunt' ? 'shunt' : 'normal',
          explicitControl,
          action.payload.routeClass === 'platform-to-premain'
            ? 'platform-to-premain'
            : action.payload.routeClass === 'premain-to-platform'
              ? 'premain-to-platform'
              : action.payload.routeClass === 'shunt'
                ? 'shunt'
                : null,
        ),
        variant: 'blinking',
      };
    }
  });
}

function getButtonVisualState(
  pieceType: string,
  routeType: RuntimeRouteType,
  explicitControl: 'normal' | 'shunt' | null,
  routeClass: ActiveTrainRoute['routeClass'] | null,
) {
  if (pieceType === 'departureButton') {
    if (explicitControl) {
      return explicitControl === 'shunt' ? 'shunt' : 'departure';
    }
    return routeType === 'shunt' ? 'shunt' : 'departure';
  }

  if (
    (pieceType === 'shuntButton' || pieceType === 'shuntButtonNoOcp') &&
    routeClass === 'platform-to-premain'
  ) {
    return 'shunt';
  }

  return routeType === 'shunt' ? 'shunt' : 'departure';
}

function applyPendingSwitchVisualState(station: StationDocument, action: PendingAction) {
  const buttonPieceId = typeof action.payload.pieceId === 'string' ? action.payload.pieceId : null;
  const position = typeof action.payload.position === 'string' ? action.payload.position : null;
  if (!buttonPieceId || (position !== 'leftSet' && position !== 'rightSet')) {
    return;
  }

  const control = getConnectedSwitchControl(station.layout, buttonPieceId);
  const button = station.layout.pieces[buttonPieceId];
  const switchPiece = control ? station.layout.pieces[control.switchPieceId] : null;
  if (!control || !button || !switchPiece) {
    return;
  }

  button.state.groups.switch = {
    state: position === 'leftSet' ? 'leftSetting' : 'rightSetting',
    variant: 'normal',
  };

  if (switchPiece.state.groups.occupation) {
    switchPiece.state.groups.occupation = {
      state: 'setting',
      variant: 'blinking',
    };
  }
}

function applyNamedIndicatorVisualState(station: StationDocument) {
  const hasPendingRouteBuild = Object.values(station.runtime.pendingActions).some(
    (action) => action.type === 'route:build-normal' || action.type === 'route:build-shunt',
  );
  const pendingCancelDelayLabels = new Set(
    Object.values(station.runtime.pendingActions)
      .filter((action) => action.type === 'route:cancel-normal' || action.type === 'route:cancel-shunt')
      .map((action) => action.payload.cancelDelayLabel)
      .filter((label): label is string => typeof label === 'string'),
  );

  Object.values(station.layout.pieces).forEach((piece) => {
    if (piece.type !== 'signButtonLight') {
      return;
    }

    const label = piece.state.texts.text;
    if (!piece.state.groups.button) {
      return;
    }

    if (label === 'stavanie VC') {
      piece.state.groups.button = {
        state: hasPendingRouteBuild ? 'danger' : 'default',
        variant: 'normal',
      };
      return;
    }

    if (label === '5s' || label === '1min' || label === '3min') {
      piece.state.groups.button = {
        state: pendingCancelDelayLabels.has(label) ? 'shunt' : 'default',
        variant: 'normal',
      };
    }
  });
}

function applyActiveOutboundLineblockVisualState(station: StationDocument) {
  const cancellingRouteIds = new Set(
    Object.values(station.runtime.pendingActions)
      .filter((action) => action.type === 'route:cancel-normal' || action.type === 'route:cancel-shunt')
      .map((action) => action.payload.routeId)
      .filter((routeId): routeId is string => typeof routeId === 'string'),
  );

  Object.values(station.runtime.activeTrainRoutes).forEach((route) => {
    if (route.routeClass !== 'platform-to-premain' || cancellingRouteIds.has(route.id)) {
      return;
    }

    const localPremainId = route.signalPieceIds.find((pieceId) => {
      const type = station.layout.pieces[pieceId]?.type;
      return type === 'premainSignal' || type === 'premainSignalNoOcp';
    });
    if (!localPremainId) {
      return;
    }

    const localPremainLink = Object.values(station.runtime.lineblockPremainLinks).find(
      (link) => link.premainSignalPieceId === localPremainId,
    );
    if (!localPremainLink) {
      return;
    }

    setLineblockVisualState(station, localPremainLink.lineblockPieceId, 'sending');
  });
}

function getOccupiedPieceIdsForStation(session: SessionDocument, stationId: string) {
  const occupiedPieceIds = new Set<string>();

  Object.values(session.runtime.trains).forEach((train) => {
    train.occupiedSensors.forEach((sensor) => {
      if (sensor.stationId === stationId) {
        occupiedPieceIds.add(sensor.pieceId);
      }
    });
  });

  Object.values(session.runtime.physicalOccupations).forEach((occupation) => {
    if (occupation.occupied && occupation.stationId === stationId) {
      occupiedPieceIds.add(occupation.pieceId);
    }
  });

  return occupiedPieceIds;
}

function normalizeRobloxStationId(stationId: string) {
  return stationId.trim().toLowerCase();
}

function getSignalFacingDirection(
  pieceType: string,
  rotation: 0 | 180,
): 'left-to-right' | 'right-to-left' | null {
  const defaultDirection: 'left-to-right' | 'right-to-left' =
    pieceType === 'departureSignal' ||
    pieceType === 'departureSignalNoOcp' ||
    pieceType === 'premainSignal' ||
    pieceType === 'premainSignalNoOcp' ||
    pieceType === 'shuntSignalButtonBuffer'
      ? 'right-to-left'
      : 'left-to-right';

  if (
    pieceType !== 'entrySignal' &&
    pieceType !== 'entrySignalNoOcp' &&
    pieceType !== 'departureSignal' &&
    pieceType !== 'departureSignalNoOcp' &&
    pieceType !== 'premainSignal' &&
    pieceType !== 'premainSignalNoOcp' &&
    pieceType !== 'shuntSignal' &&
    pieceType !== 'shuntSignalNoOcp' &&
    pieceType !== 'shuntSignalButtonBuffer'
  ) {
    return null;
  }

  if (rotation === 180) {
    return defaultDirection === 'left-to-right' ? 'right-to-left' : 'left-to-right';
  }

  return defaultDirection;
}

function getPieceCenter(station: StationDocument, pieceId: string) {
  const cells = getPieceCells(station.layout, pieceId);
  return {
    x: cells.reduce((sum, [x]) => sum + x, 0) / cells.length,
    y: cells.reduce((sum, [, y]) => sum + y, 0) / cells.length,
  };
}

function getResolvedSignalFamily(pieceType: string): RobloxResolvedSignalFamily | null {
  if (pieceType === 'entrySignal' || pieceType === 'entrySignalNoOcp') {
    return 'entry';
  }
  if (pieceType === 'departureSignal' || pieceType === 'departureSignalNoOcp') {
    return 'departure';
  }
  if (pieceType === 'premainSignal' || pieceType === 'premainSignalNoOcp') {
    return 'premain';
  }
  if (
    pieceType === 'shuntSignal' ||
    pieceType === 'shuntSignalNoOcp' ||
    pieceType === 'shuntSignalButtonBuffer'
  ) {
    return 'shunt';
  }

  return null;
}

function getOrderedFacingSignalsForRoute(station: StationDocument, route: ActiveTrainRoute) {
  const directionSign = route.direction === 'left-to-right' ? 1 : -1;
  return Array.from(new Set(route.signalPieceIds))
    .filter((pieceId) => {
      const piece = station.layout.pieces[pieceId];
      return (
        piece?.state.groups.signal &&
        piece.type !== 'shuntSignal' &&
        piece.type !== 'shuntSignalNoOcp' &&
        getSignalFacingDirection(piece.type, piece.rotation) === route.direction
      );
    })
    .sort((leftId, rightId) => {
      const leftX = getPieceCenter(station, leftId).x;
      const rightX = getPieceCenter(station, rightId).x;
      return (leftX - rightX) * directionSign;
    });
}

function getRouteHasSpeedRestriction(station: StationDocument, route: ActiveTrainRoute) {
  return route.path.some((step) => {
    const pieceType = station.layout.pieces[step.pieceId]?.type;
    return pieceType ? isDivergingSwitchTraversal(pieceType, step.traversalState) : false;
  });
}

function getBaseResolvedSignalAspect(
  family: RobloxResolvedSignalFamily,
  signalState: string,
): RobloxResolvedSignalAspect {
  if (signalState === 'default') {
    return family === 'premain' ? 'caution' : 'danger';
  }

  if (family === 'shunt') {
    return signalState === 'shunt' ? 'shunt' : 'danger';
  }

  if (family === 'premain') {
    return signalState === 'departure' ? 'proceed' : 'caution';
  }

  if (signalState === 'caution') {
    return 'caution';
  }
  if (signalState === 'departure') {
    return 'proceed';
  }
  if (signalState === 'shunt') {
    return 'shunt';
  }

  return 'danger';
}

function getResolvedStartSignalIdForRoute(station: StationDocument, route: ActiveTrainRoute) {
  if (route.routeClass === 'platform-to-premain') {
    return route.targetPlatformDepartureSignalPieceId;
  }

  const orderedSignals = getOrderedFacingSignalsForRoute(station, route);
  if (route.routeClass === 'premain-to-platform') {
    // The entry signal governs the speed through the station switches. The
    // preceding premain signal announces that restriction after the entry has
    // been resolved, rather than receiving the entry's 40 km/h aspect itself.
    return (
      orderedSignals.find(
        (pieceId) => getResolvedSignalFamily(station.layout.pieces[pieceId]?.type ?? '') === 'entry',
      ) ?? null
    );
  }

  return orderedSignals[0] ?? null;
}

function applySpeedRestrictionToResolvedAspect(
  family: RobloxResolvedSignalFamily,
  aspect: RobloxResolvedSignalAspect,
): RobloxResolvedSignalAspect {
  if (family === 'departure' || family === 'entry') {
    if (aspect === 'proceed') {
      return 'proceed40Proceed';
    }
    if (aspect === 'caution') {
      return 'proceed40Caution';
    }
    return aspect;
  }

  if (family === 'premain') {
    if (aspect === 'proceed') {
      return 'proceed40Proceed';
    }
    if (aspect === 'caution') {
      return 'expect40';
    }
  }

  return aspect;
}

function hasLocal40SpeedRestriction(aspect: RobloxResolvedSignalAspect | null | undefined) {
  return (
    aspect === 'proceed40' ||
    aspect === 'proceed40Caution' ||
    aspect === 'proceed40Proceed' ||
    aspect === 'proceed40Expect40' ||
    aspect === 'proceed40Expect60' ||
    aspect === 'proceed40Expect80' ||
    aspect === 'proceed40Expect100'
  );
}

function buildResolvedRobloxSignalAspects(station: StationDocument) {
  const projectedStation = structuredClone(station);
  applyActiveRouteVisualState(projectedStation, tiles);

  const resolved = new Map<
    string,
    { family: RobloxResolvedSignalFamily; aspect: RobloxResolvedSignalAspect }
  >();

  Object.entries(projectedStation.layout.pieces).forEach(([pieceId, piece]) => {
    const family = getResolvedSignalFamily(piece.type);
    const signalState = piece.state.groups.signal?.state;
    if (!family || !signalState) {
      return;
    }

    resolved.set(pieceId, {
      family,
      aspect: getBaseResolvedSignalAspect(family, signalState),
    });
  });

  const normalRoutes = Object.values(station.runtime.activeTrainRoutes).filter(
    (route) => route.routeType === 'normal',
  );
  const locallyRestrictedSignalIds = new Set<string>();

  normalRoutes.forEach((route) => {
    if (!getRouteHasSpeedRestriction(station, route)) {
      return;
    }

    const startSignalId = getResolvedStartSignalIdForRoute(station, route);
    if (!startSignalId) {
      return;
    }

    const current = resolved.get(startSignalId);
    if (!current) {
      return;
    }

    resolved.set(startSignalId, {
      ...current,
      aspect: applySpeedRestrictionToResolvedAspect(current.family, current.aspect),
    });
    locallyRestrictedSignalIds.add(startSignalId);
  });

  const signalPlans = buildSignalRoutePlans(station, normalRoutes, tiles);
  signalPlans.forEach((plan, pieceId) => {
    if (!plan.nextSignalPieceId || !locallyRestrictedSignalIds.has(plan.nextSignalPieceId)) {
      return;
    }

    const current = resolved.get(pieceId);
    if (!current) {
      return;
    }

    resolved.set(pieceId, {
      ...current,
      aspect:
        locallyRestrictedSignalIds.has(pieceId) && hasLocal40SpeedRestriction(current.aspect)
          ? 'proceed40Expect40'
          : 'expect40',
    });
  });

  // PN is a persisted signal override, not a normal route aspect. Apply it
  // last so route and speed resolution cannot replace the legacy `spn`
  // indication while the call-on remains active.
  Object.keys(station.runtime.activePrivolavaciaSignals).forEach((pieceId) => {
    const current = resolved.get(pieceId);
    if (current && (current.family === 'entry' || current.family === 'departure')) {
      resolved.set(pieceId, {
        ...current,
        aspect: 'callOn',
      });
    }
  });

  return resolved;
}

function getRoutePreStartPieceId(station: StationDocument, route: ActiveTrainRoute) {
  const sourcePiece = station.layout.pieces[route.sourcePieceId];
  if (!sourcePiece) {
    return null;
  }

  const directionSign = route.direction === 'left-to-right' ? 1 : -1;
  const anchor = getPieceAnchor(station.layout, route.sourcePieceId);
  const candidateX = anchor.x - directionSign;
  const candidateY = anchor.y;

  if (
    candidateX < 0 ||
    candidateY < 0 ||
    candidateY >= station.layout.height ||
    candidateX >= station.layout.width
  ) {
    return null;
  }

  const ref = parseCellRef(station.layout.map[candidateY][candidateX]);
  return ref.pieceId || null;
}

function getRouteCancelDelay(
  station: StationDocument,
  route: ActiveTrainRoute,
  occupiedPieceIds: Set<string>,
) {
  if (route.reservedOccupations.some((occupation) => occupiedPieceIds.has(occupation.pieceId))) {
    throw new Error('The route can no longer be cancelled because a train has already entered it.');
  }

  const preStartPieceId = getRoutePreStartPieceId(station, route);
  if (preStartPieceId && occupiedPieceIds.has(preStartPieceId)) {
    const label = route.routeType === 'shunt' ? '1min' : '3min';
    return {
      durationMs: route.routeType === 'shunt' ? 60_000 : 180_000,
      label,
    };
  }

  return {
    durationMs: 5_000,
    label: '5s',
  };
}

function formatPrivolavaciaCounterValue(value: number) {
  return String(Math.max(0, Math.trunc(value))).padStart(6, '0').slice(-6);
}

function getPrivolavaciaCounterValue(piece: StationDocument['layout']['pieces'][string]) {
  const digitKeys = ['digit6', 'digit5', 'digit4', 'digit3', 'digit2', 'digit1'] as const;
  const digits = digitKeys.map((key) => piece.state.texts[key] ?? '0').join('');
  const parsed = Number.parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function setPrivolavaciaCounterVisualState(
  station: StationDocument,
  sealedCounterPieceId: string,
  active: boolean,
  nextCounterValue?: number,
) {
  const piece = station.layout.pieces[sealedCounterPieceId];
  if (!piece || !isPrivolavaciaCounterPieceType(piece.type)) {
    return;
  }

  if (typeof nextCounterValue === 'number') {
    const formatted = formatPrivolavaciaCounterValue(nextCounterValue);
    ['digit6', 'digit5', 'digit4', 'digit3', 'digit2', 'digit1'].forEach((key, index) => {
      piece.state.texts[key] = formatted[index];
    });
  }

  if (piece.state.groups.seal) {
    piece.state.groups.seal = {
      state: active ? 'unsealed' : 'sealed',
      variant: 'normal',
    };
  }
}

function applyPrivolavaciaVisualState(station: StationDocument) {
  const selectedCounterId = station.runtime.privolavaciaSelection?.sealedCounterPieceId ?? null;
  const activeCounterIds = new Set(
    Object.values(station.runtime.activePrivolavaciaSignals).map((entry) => entry.sealedCounterPieceId),
  );
  if (selectedCounterId) {
    activeCounterIds.add(selectedCounterId);
  }

  Object.entries(station.layout.pieces).forEach(([pieceId, piece]) => {
    if (!isPrivolavaciaCounterPieceType(piece.type)) {
      return;
    }
    setPrivolavaciaCounterVisualState(station, pieceId, activeCounterIds.has(pieceId));
  });

  Object.values(station.runtime.activePrivolavaciaSignals).forEach((entry) => {
    const signalPiece = station.layout.pieces[entry.signalPieceId];
    if (signalPiece?.state.groups.signal) {
      signalPiece.state.groups.signal = {
        state: 'shunt',
        variant: 'blinking',
      };
    }

    setPrivolavaciaCounterVisualState(station, entry.sealedCounterPieceId, true);
  });
}

function getPrivolavaciaLinkedSignals(station: StationDocument, sealedCounterPieceId: string) {
  return getPrivolavaciaSignalLinksFromLayout(station.layout)[sealedCounterPieceId] ?? [];
}

function getDepartureSignalPieceIdForButton(
  station: StationDocument,
  departureButtonPieceId: string,
) {
  const anchor = getPieceAnchor(station.layout, departureButtonPieceId);

  for (const directionX of [-1, 1]) {
    const signalCell = {
      x: anchor.x + directionX,
      y: anchor.y,
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
    if (piece?.type === 'departureSignal' || piece?.type === 'departureSignalNoOcp') {
      return ref.pieceId;
    }
  }

  return null;
}

function getEntrySignalPieceIdForPremain(
  station: StationDocument,
  premainSignalPieceId: string,
) {
  const departureButtonPieceIds = Object.entries(station.layout.pieces)
    .filter(([, piece]) => piece.type === 'departureButton')
    .map(([pieceId]) => pieceId);

  for (const departureButtonPieceId of departureButtonPieceIds) {
    try {
      const route = buildRouteFromSelection(
        station,
        premainSignalPieceId,
        departureButtonPieceId,
        tiles,
        'normal',
        false,
      );
      const entrySignalPieceId = route.signalPieceIds.find((pieceId) => {
        const type = station.layout.pieces[pieceId]?.type;
        return type === 'entrySignal' || type === 'entrySignalNoOcp';
      });
      if (entrySignalPieceId) {
        return entrySignalPieceId;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function getPrivolavaciaSignalPieceIdForControl(station: StationDocument, pieceId: string) {
  const piece = station.layout.pieces[pieceId];
  if (!piece) {
    return null;
  }

  if (piece.type === 'departureButton') {
    return getDepartureSignalPieceIdForButton(station, pieceId);
  }

  if (piece.type === 'premainSignal' || piece.type === 'premainSignalNoOcp') {
    return getEntrySignalPieceIdForPremain(station, pieceId);
  }

  return isPrivolavaciaSignalPieceType(piece.type) ? pieceId : null;
}

function cancelPrivolavaciaSignal(station: StationDocument, signalPieceId: string) {
  delete station.runtime.activePrivolavaciaSignals[signalPieceId];
  if (
    station.runtime.privolavaciaSelection &&
    !station.layout.pieces[station.runtime.privolavaciaSelection.sealedCounterPieceId]
  ) {
    station.runtime.privolavaciaSelection = null;
  }
}

function activatePrivolavaciaSignal(
  station: StationDocument,
  sealedCounterPieceId: string,
  signalPieceId: string,
  activatedAt: string,
) {
  const sealedCounterPiece = station.layout.pieces[sealedCounterPieceId];
  const signalPiece = station.layout.pieces[signalPieceId];
  if (
    !sealedCounterPiece ||
    !signalPiece ||
    !isPrivolavaciaCounterPieceType(sealedCounterPiece.type) ||
    !isPrivolavaciaSignalPieceType(signalPiece.type)
  ) {
    throw new Error('The selected PN counter or signal was not found.');
  }

  const linkedSignalIds = getPrivolavaciaLinkedSignals(station, sealedCounterPieceId);
  if (!linkedSignalIds.includes(signalPieceId)) {
    throw new Error('The selected signal is not linked to this PN counter.');
  }

  const currentCounterValue = getPrivolavaciaCounterValue(sealedCounterPiece);
  setPrivolavaciaCounterVisualState(station, sealedCounterPieceId, true, currentCounterValue + 1);
  station.runtime.activePrivolavaciaSignals[signalPieceId] = {
    signalPieceId,
    sealedCounterPieceId,
    activatedAt,
  };
}

function applyRuntimeState(station: StationDocument) {
  applyActiveRouteVisualState(station, tiles);

  if (station.runtime.routeSelection) {
    applyRouteSelectionVisualState(station, station.runtime.routeSelection);
  }

  Object.values(station.runtime.pendingActions).forEach((action) => {
    if (
      action.type === 'route:build-normal' ||
      action.type === 'route:cancel-normal' ||
      action.type === 'route:build-shunt' ||
      action.type === 'route:cancel-shunt'
    ) {
      applyPendingRouteVisualState(station, action);
    }
    if (action.type === 'switch:set-position') {
      applyPendingSwitchVisualState(station, action);
    }
  });

  applyPrivolavaciaVisualState(station);
  applyNamedIndicatorVisualState(station);
  applyActiveOutboundLineblockVisualState(station);
}

function ensureSessionRuntimeState(session: SessionDocument) {
  session.mockMode ??= true;
  session.interpreter ??= { kind: 'mock' };
  if (session.interpreter.kind === 'roblox') {
    session.interpreter.heartbeat ??= {
      lastHeartbeatAt: null,
    };
  }
  session.runtime ??= {
    trains: {},
    lineblocks: {},
    physicalOccupations: {},
  };
  session.runtime.trains ??= {};
  session.runtime.lineblocks ??= {};
  session.runtime.physicalOccupations ??= {};

  Object.values(session.topology.lineblockLinks).forEach((link) => {
    link.defaultFlow = normalizeLineblockDefaultFlow(link.defaultFlow);
  });

  Object.values(session.runtime.trains).forEach((train) => {
    train.occupiedSensors.forEach((sensor) => {
      sensor.routeId ??= null;
    });
  });

  Object.keys(session.topology.lineblockLinks).forEach((linkId) => {
    session.runtime.lineblocks[linkId] ??= {
      arrivalAcknowledgementEligible: false,
      trainId: null,
      updatedAt: session.updatedAt,
    };
  });

  return session;
}

function isRobloxSessionLive(session: SessionDocument, now = Date.now()) {
  if (session.interpreter.kind !== 'roblox') {
    return false;
  }

  const heartbeatAt = session.interpreter.heartbeat.lastHeartbeatAt;
  if (!heartbeatAt) {
    return false;
  }

  const heartbeatTime = Date.parse(heartbeatAt);
  if (Number.isNaN(heartbeatTime)) {
    return false;
  }

  return now - heartbeatTime <= ROBLOX_SESSION_HEARTBEAT_TIMEOUT_MS;
}

function applySessionTrainOccupations(station: StationDocument, session: SessionDocument) {
  const mockOccupiedSensors = Object.values(session.runtime.trains).flatMap((train) =>
    train.occupiedSensors
      .filter((sensor) => sensor.stationId === station.stationId)
      .map((sensor) => ({
        pieceId: sensor.pieceId,
        occupationState: sensor.occupationState,
      })),
  );
  const physicalOccupiedSensors = Object.values(session.runtime.physicalOccupations)
    .filter((occupation) => occupation.occupied && occupation.stationId === station.stationId)
    .filter((occupation) => {
      const piece = station.layout.pieces[occupation.pieceId];
      if (
        !piece ||
        !isPhysicalSwitchType(piece.type) ||
        occupation.traversalState === null
      ) {
        return true;
      }

      return isOccupationVisibleForSwitchAlignment(
        piece.type,
        occupation.traversalState,
        station.runtime.switchAlignments[occupation.pieceId]?.traversableState,
      );
    })
    .map((occupation) => ({
      pieceId: occupation.pieceId,
      occupationState: occupation.traversalState ?? 'occupied',
    }));
  applyTrainOccupationVisualState(station, [...mockOccupiedSensors, ...physicalOccupiedSensors]);
  Object.values(station.runtime.pendingActions).forEach((action) => {
    if (action.type === 'switch:set-position') {
      applyPendingSwitchVisualState(station, action);
    }
  });
}

function applyRuntimeStateWithTrainOccupations(station: StationDocument, session: SessionDocument) {
  applyRuntimeState(station);
  applySessionTrainOccupations(station, session);
}

function isPhysicalSwitchPieceType(pieceType: string) {
  return isPhysicalSwitchType(pieceType);
}

function getSpawnOccupationState(station: StationDocument, pieceId: string, row: number) {
  const piece = station.layout.pieces[pieceId];
  if (!piece?.state.groups.occupation) {
    return null;
  }

  const alignedState = station.runtime.switchAlignments[pieceId]?.traversableState;
  if (alignedState) {
    if (piece.type === 'singleSwitch' && alignedState === 'blTtr') {
      return 't';
    }
    return alignedState;
  }

  const anchor = getPieceAnchor(station.layout, pieceId);
  if (piece.type === 'crossoverSwitch') {
    return row === anchor.y ? 't' : 'b';
  }
  if (piece.type === 'singleSwitch') {
    return row === anchor.y ? 't' : 'blTbr';
  }
  if (piece.type === 'extendedSwitch') {
    return row === anchor.y ? 'blTtr' : row === anchor.y + 1 ? 'blTmr' : 'blTbr';
  }

  return 'occupied';
}

function getSpawnSensorPositions(
  station: StationDocument,
  frontPieceId: string,
  direction: TrainDirection,
  length: number,
) {
  const frontPiece = station.layout.pieces[frontPieceId];
  if (!frontPiece?.state.groups.occupation) {
    throw new Error('The selected starting segment does not have an occupation sensor.');
  }

  const anchor = getPieceAnchor(station.layout, frontPieceId);
  const rearDirection = direction === 'left-to-right' ? -1 : 1;
  const sensors: MockTrain['occupiedSensors'] = [];
  const seen = new Set<string>();

  for (
    let x = anchor.x;
    x >= 0 && x < station.layout.width && sensors.length < length;
    x += rearDirection
  ) {
    const cellRef = station.layout.map[anchor.y]?.[x];
    if (!cellRef) {
      break;
    }

    const { pieceId } = parseCellRef(cellRef);
    if (seen.has(pieceId)) {
      continue;
    }
    seen.add(pieceId);

    if (station.layout.pieces[pieceId]?.type === 'filler') {
      break;
    }

    const occupationState = getSpawnOccupationState(station, pieceId, anchor.y);
    if (occupationState) {
      sensors.push({
        stationId: station.stationId,
        pieceId,
        occupationState,
        routeId: null,
      });
    }
  }

  if (sensors.length !== length) {
    throw new Error(
      `Only ${sensors.length} connected occupation sensors fit behind the selected front segment.`,
    );
  }

  return sensors;
}

function hasOppositeSideStoppingSignal(station: StationDocument, route: ActiveTrainRoute) {
  const targetPiece = station.layout.pieces[route.targetPieceId];
  if (
    !targetPiece ||
    (targetPiece.type !== 'shuntButton' &&
      targetPiece.type !== 'shuntButtonNoOcp' &&
      targetPiece.type !== 'shuntSignalButtonBuffer')
  ) {
    return false;
  }

  const targetAnchor = getPieceAnchor(station.layout, route.targetPieceId);
  const directionSign = route.direction === 'left-to-right' ? 1 : -1;
  const signalCellX = targetAnchor.x - directionSign;
  if (signalCellX < 0 || signalCellX >= station.layout.width) {
    return false;
  }

  const ref = parseCellRef(station.layout.map[targetAnchor.y]?.[signalCellX] ?? '');
  const piece = station.layout.pieces[ref.pieceId];
  return (
    piece?.type === 'departureSignal' ||
    piece?.type === 'departureSignalNoOcp' ||
    piece?.type === 'shuntSignal' ||
    piece?.type === 'shuntSignalNoOcp'
  );
}

function appendShuntButtonTailClearanceSteps(
  station: StationDocument,
  route: ActiveTrainRoute,
  steps: TrainMovementStep[],
  trainLength: number,
) {
  if (!hasOppositeSideStoppingSignal(station, route) || trainLength <= 1) {
    return steps;
  }

  const lastStep = steps.at(-1);
  if (!lastStep) {
    return steps;
  }

  const directionSign = route.direction === 'left-to-right' ? 1 : -1;
  const anchor = getPieceAnchor(station.layout, lastStep.pieceId);
  const extraSteps: TrainMovementStep[] = [];
  const seen = new Set(steps.map((step) => step.pieceId));

  for (
    let x = anchor.x + directionSign;
    x >= 0 && x < station.layout.width && extraSteps.length < trainLength - 1;
    x += directionSign
  ) {
    const cellRef = station.layout.map[anchor.y]?.[x];
    if (!cellRef) {
      break;
    }

    const { pieceId } = parseCellRef(cellRef);
    if (seen.has(pieceId)) {
      continue;
    }
    seen.add(pieceId);

    const piece = station.layout.pieces[pieceId];
    if (!piece || piece.type === 'filler') {
      break;
    }
    if (!piece.state.groups.occupation) {
      continue;
    }

    extraSteps.push({
      stationId: station.stationId,
      routeId: route.id,
      routeStepIndex: route.path.length + extraSteps.length,
      pieceId,
      traversalState: route.path.at(-1)?.traversalState ?? '0',
      occupationState: getSpawnOccupationState(station, pieceId, anchor.y),
      signalPieceId: null,
    });
  }

  return [...steps, ...extraSteps];
}

function getRouteSteps(
  station: StationDocument,
  route: ActiveTrainRoute,
  trainLength = 1,
): TrainMovementStep[] {
  const steps = route.path.map((step, routeStepIndex) => ({
    stationId: station.stationId,
    routeId: route.id,
    routeStepIndex,
    pieceId: step.pieceId,
    traversalState: step.traversalState,
    occupationState: step.occupationState,
    signalPieceId: step.signalPieceId,
  }));

  const lastStep = steps.at(-1);
  const lastPieceType = lastStep ? station.layout.pieces[lastStep.pieceId]?.type : null;
  const retainTargetButtonStep = hasOppositeSideStoppingSignal(station, route);
  if (
    lastStep &&
    !retainTargetButtonStep &&
    (lastPieceType === 'departureButton' ||
      lastPieceType === 'shuntButton' ||
      lastPieceType === 'shuntButtonNoOcp' ||
      lastPieceType === 'shuntSignalButtonBuffer')
  ) {
    steps.pop();
  }

  return appendShuntButtonTailClearanceSteps(station, route, steps, trainLength);
}

type ExitPoint = {
  x: number;
  y: number;
};

const PN_TRAVERSAL_FALLBACK_TYPES: Record<string, string> = {
  departureSignalNoOcp: 'departureSignal',
  entrySignalNoOcp: 'entrySignal',
  premainSignalNoOcp: 'premainSignal',
  shuntSignalNoOcp: 'shuntSignal',
  singleSwitchNoOcp: 'singleSwitch',
  crossoverSwitchNoOcp: 'crossoverSwitch',
  extendedSwitchNoOcp: 'extendedSwitch',
  trackNoOcp: 'track',
  trackSignNoOcp: 'trackSign',
};

function toOffsetKey(point: ExitPoint) {
  return `${point.x},${point.y}`;
}

function parseOffsetKey(key: string): ExitPoint {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
}

function normalizeDirectionSign(direction: TrainDirection) {
  return direction === 'left-to-right' ? 1 : -1;
}

function isAnySignalPieceType(pieceType: string | undefined) {
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

function getPnTraversalTile(pieceType: string) {
  const tile = tiles[pieceType];
  if (tile?.traversable !== false) {
    return tile;
  }

  const fallbackType = PN_TRAVERSAL_FALLBACK_TYPES[pieceType];
  return fallbackType ? tiles[fallbackType] : tile;
}

function getPnTraversalEdgeStep(
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
    .sort((left, right) => Math.abs(edge.y - left.y) - Math.abs(edge.y - right.y))[0];

  if (!adjacentSourceCell) {
    return null;
  }

  return {
    x: edge.x - adjacentSourceCell.x,
    y: edge.y - adjacentSourceCell.y,
  };
}

function transformPnExternalPoint(
  point: ExitPoint,
  space: { x: number; y: number },
  rotation: 0 | 180,
  mirrored: boolean,
) {
  const [x, y] = transformPoint(point.x, point.y, space, { rotation, mirrored });
  return { x, y };
}

function getPnTraversalOptions(station: StationDocument, pieceId: string) {
  const piece = station.layout.pieces[pieceId];
  if (!piece) {
    return [];
  }

  const tile = getPnTraversalTile(piece.type);
  if (!tile || tile.traversable === false) {
    return [];
  }

  const alignedState = station.runtime.switchAlignments[pieceId]?.traversableState;

  return Object.entries(tile.traversable).flatMap(([stateKey, routes]) => {
    if (alignedState && stateKey !== alignedState) {
      return [];
    }

    return Object.entries(routes ?? {}).map(([entryKey, exitKey]) => ({
      state: stateKey,
      entry: transformPnExternalPoint(
        parseOffsetKey(entryKey),
        tile.space,
        piece.rotation,
        piece.mirrored,
      ),
      exit: transformPnExternalPoint(
        parseOffsetKey(exitKey),
        tile.space,
        piece.rotation,
        piece.mirrored,
      ),
      occupationState: piece.state.groups.occupation
        ? stateKey === '0'
          ? 'reserved'
          : stateKey
        : null,
    }));
  });
}

function getPnNeighborTraversal(station: StationDocument, sourcePieceId: string, exit: ExitPoint) {
  const sourceAnchor = getPieceAnchor(station.layout, sourcePieceId);
  const step = getPnTraversalEdgeStep(station, sourcePieceId, exit);
  if (!step) {
    return null;
  }

  const neighborCell = {
    x: sourceAnchor.x + exit.x,
    y: sourceAnchor.y + exit.y,
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
  return {
    pieceId: neighborRef.pieceId,
    entry: {
      x: neighborCell.x - neighborAnchor.x - step.x,
      y: neighborCell.y - neighborAnchor.y - step.y,
    },
  };
}

function buildPrivolavaciaSteps(
  station: StationDocument,
  train: MockTrain,
  signalPieceId: string,
) {
  const directionSign = normalizeDirectionSign(train.direction);
  const startEntry = directionSign > 0 ? { x: -1, y: 0 } : { x: 1, y: 0 };
  const visited = new Set<string>();
  const steps: TrainMovementStep[] = [];

  let currentPieceId: string | null = signalPieceId;
  let currentEntry: ExitPoint | null = startEntry;

  while (currentPieceId && currentEntry) {
    const pieceId = currentPieceId;
    const entryPoint = currentEntry;
    const visitedKey = `${pieceId}:${toOffsetKey(entryPoint)}`;
    if (visited.has(visitedKey)) {
      break;
    }
    visited.add(visitedKey);

    const piece = station.layout.pieces[pieceId];
    if (!piece) {
      break;
    }

    const option = getPnTraversalOptions(station, pieceId).find((candidate) => {
      return (
        toOffsetKey(candidate.entry) === toOffsetKey(entryPoint) &&
        Math.sign(getPnTraversalEdgeStep(station, pieceId, candidate.exit)?.x ?? 0) === directionSign
      );
    });

    if (!option) {
      break;
    }

    steps.push({
      stationId: station.stationId,
      routeId: `pn:${signalPieceId}`,
      routeStepIndex: steps.length,
      pieceId,
      traversalState: option.state,
      occupationState: option.occupationState,
      signalPieceId: isAnySignalPieceType(piece.type) ? pieceId : null,
    });

    if (pieceId !== signalPieceId && isAnySignalPieceType(piece.type)) {
      break;
    }

    const neighbor = getPnNeighborTraversal(station, pieceId, option.exit);
    if (!neighbor) {
      break;
    }

    currentPieceId = neighbor.pieceId;
    currentEntry = neighbor.entry;
  }

  return steps;
}

function findPrivolavaciaMovement(station: StationDocument, train: MockTrain) {
  const directionSign = normalizeDirectionSign(train.direction);
  const frontAnchor = getPieceAnchor(station.layout, train.location.pieceId);

  const candidateSignalIds = Object.keys(station.runtime.activePrivolavaciaSignals)
    .filter((signalPieceId) => {
      const signalPiece = station.layout.pieces[signalPieceId];
      if (!signalPiece) {
        return false;
      }

      const signalAnchor = getPieceAnchor(station.layout, signalPieceId);
      return (
        signalAnchor.y === frontAnchor.y &&
        (signalAnchor.x - frontAnchor.x) * directionSign >= 0 &&
        (signalAnchor.x - frontAnchor.x) * directionSign <= 2
      );
    })
    .sort((leftId, rightId) => {
      const leftDistance =
        (getPieceAnchor(station.layout, leftId).x - frontAnchor.x) * directionSign;
      const rightDistance =
        (getPieceAnchor(station.layout, rightId).x - frontAnchor.x) * directionSign;
      return leftDistance - rightDistance;
    });

  const signalPieceId = candidateSignalIds[0];
  if (!signalPieceId) {
    return null;
  }

  const steps = buildPrivolavaciaSteps(station, train, signalPieceId);
  if (steps.length === 0) {
    return null;
  }

  const startIndex = steps.findIndex((step) => step.pieceId === train.location.pieceId);
  const remainingSteps = startIndex >= 0 ? steps.slice(startIndex + 1) : steps;
  if (remainingSteps.length === 0) {
    return null;
  }

  return {
    signalPieceId,
    steps: remainingSteps,
  };
}

function findNextLocalRoute(station: StationDocument, train: MockTrain) {
  const routes = Object.values(station.runtime.activeTrainRoutes).filter(
    (route) => route.direction === train.direction && route.path.length > 0,
  );

  if (train.location.routeId) {
    const currentRoute = station.runtime.activeTrainRoutes[train.location.routeId];
    if (currentRoute && train.location.routeStepIndex !== null) {
      const remainingSteps = getRouteSteps(station, currentRoute, train.length).slice(
        train.location.routeStepIndex + 1,
      );
      if (remainingSteps.length > 0) {
        return {
          route: currentRoute,
          steps: remainingSteps,
        };
      }
    }
  }

  for (const route of routes) {
    const currentStepIndex = route.path.findIndex(
      (step) => step.pieceId === train.location.pieceId,
    );
    if (currentStepIndex < 0) {
      continue;
    }

    const remainingSteps = getRouteSteps(station, route, train.length).filter(
      (step) => step.routeStepIndex > currentStepIndex,
    );
    if (remainingSteps.length > 0) {
      return {
        route,
        steps: remainingSteps,
      };
    }
  }

  const frontAnchor = getPieceAnchor(station.layout, train.location.pieceId);
  const directionSign = train.direction === 'left-to-right' ? 1 : -1;
  const candidates = routes
    .map((route) => {
      const firstStep = route.path[0];
      const firstAnchor = getPieceAnchor(station.layout, firstStep.pieceId);
      return {
        route,
        distance: (firstAnchor.x - frontAnchor.x) * directionSign,
        sameRow: firstAnchor.y === frontAnchor.y,
      };
    })
    .filter((candidate) => candidate.sameRow && candidate.distance > 0 && candidate.distance <= 2)
    .sort((a, b) => a.distance - b.distance);

  const candidate = candidates[0];
  return candidate
    ? { route: candidate.route, steps: getRouteSteps(station, candidate.route, train.length) }
    : null;
}

function mergeCrossoverAlignment(current: string | undefined, incoming: string) {
  if (!current || current === incoming) {
    return incoming;
  }

  if (current === 'blTtr' || incoming === 'blTtr') {
    throw new Error('The crossover is aligned incompatibly with another active route.');
  }

  const straightStates = new Set(['t', 'b', 'tlTtrAblTbr']);
  if (straightStates.has(current) && straightStates.has(incoming)) {
    return 'tlTtrAblTbr';
  }

  throw new Error('The crossover is aligned incompatibly with another active route.');
}

function crossoverAlignmentAllows(current: string, required: string) {
  if (
    current === required ||
    (current === 'tlTtrAblTbr' && (required === 't' || required === 'b'))
  ) {
    return true;
  }
  return false;
}

function applyRouteSwitchAlignments(
  station: StationDocument,
  session: SessionDocument,
  route: ActiveTrainRoute,
) {
  route.path.forEach((step) => {
    const piece = station.layout.pieces[step.pieceId];
    if (!piece || !isPhysicalSwitchPieceType(piece.type)) {
      return;
    }

    const current = station.runtime.switchAlignments[step.pieceId]?.traversableState;
    const occupied = Object.values(session.runtime.trains).some((train) =>
      train.occupiedSensors.some(
        (sensor) => sensor.stationId === station.stationId && sensor.pieceId === step.pieceId,
      ),
    );
    if (
      occupied &&
      current &&
      (isCrossoverSwitchType(piece.type)
        ? !crossoverAlignmentAllows(current, step.traversalState)
        : current !== step.traversalState)
    ) {
      throw new Error(`Switch "${step.pieceId}" cannot move while occupied.`);
    }

    const activeStates = Object.values(station.runtime.activeTrainRoutes).flatMap((activeRoute) =>
      activeRoute.reservedOccupations.some((occupation) => occupation.pieceId === step.pieceId)
        ? activeRoute.path
            .filter((activeStep) => activeStep.pieceId === step.pieceId)
            .map((activeStep) => activeStep.traversalState)
        : [],
    );
    const traversableState = isCrossoverSwitchType(piece.type)
      ? ([...activeStates, step.traversalState].reduce<string | undefined>(
          (merged, state) => mergeCrossoverAlignment(merged, state),
          undefined,
        ) ?? step.traversalState)
      : step.traversalState;

    if (
      !isCrossoverSwitchType(piece.type) &&
      activeStates.some((state) => state !== step.traversalState)
    ) {
      throw new Error(
        `Switch "${step.pieceId}" is required in another position by an active route.`,
      );
    }

    if (!isSwitchTraversalAllowedByButtonLocks(station, step.pieceId, step.traversalState)) {
      throw new Error(`Switch "${step.pieceId}" is fixed in another position.`);
    }

    const motorPositions = {
      ...(station.runtime.switchAlignments[step.pieceId]?.motorPositions ?? {}),
      ...getRequiredSwitchMotorPositions(piece.type, step.traversalState),
    };
    const physicalTraversableState =
      getTraversableStateForMotorPositions(piece.type, motorPositions) ?? traversableState;

    station.runtime.switchAlignments[step.pieceId] = {
      traversableState: physicalTraversableState,
      motorPositions,
      updatedAt: nowIso(),
    };
  });
}

function hydrateLegacyActiveRoutePaths(station: StationDocument, session: SessionDocument) {
  let changed = false;

  Object.values(station.runtime.activeTrainRoutes).forEach((route) => {
    if (route.path.length > 0) {
      return;
    }

    try {
      const rebuilt = buildRouteFromSelection(
        station,
        route.sourcePieceId,
        route.targetPieceId,
        tiles,
        route.routeType,
        false,
      );
      if (rebuilt.routeClass !== route.routeClass || rebuilt.direction !== route.direction) {
        return;
      }

      route.path = rebuilt.path;
      route.passedSignalPieceIds ??= [];
      applyRouteSwitchAlignments(station, session, route);
      changed = true;
    } catch (error) {
      console.warn(
        `[route-migration] Unable to rebuild ${station.sessionId}/${station.stationId}/${route.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  });

  return changed;
}

function getLinkedLineblock(station: StationDocument, session: SessionDocument, pieceId: string) {
  const link = Object.values(session.topology.lineblockLinks).find(
    (entry) =>
      (entry.a.stationId === station.stationId && entry.a.pieceId === pieceId) ||
      (entry.b.stationId === station.stationId && entry.b.pieceId === pieceId),
  );

  if (!link) {
    return null;
  }

  const remote =
    link.a.stationId === station.stationId && link.a.pieceId === pieceId ? link.b : link.a;

  return {
    link,
    remote,
  };
}

function validateLineblockActionStates(
  actionType: LineblockActionType,
  localState: string,
  remoteState: string,
) {
  if (actionType === 'lineblock:grant-consent') {
    if (localState !== 'default' || remoteState !== 'default') {
      throw new Error('Lineblock consent can only be granted from default/default.');
    }

    return;
  }

  if (actionType === 'lineblock:revoke-consent') {
    if (localState !== 'receivingFree' || remoteState !== 'sendingFree') {
      throw new Error('Lineblock consent can only be revoked from receivingFree/sendingFree.');
    }

    return;
  }

  if (actionType === 'lineblock:mark-departed') {
    if (localState !== 'sendingFree' || remoteState !== 'receivingFree') {
      throw new Error('A departure can only be marked from sendingFree/receivingFree.');
    }

    return;
  }

  if (actionType === 'lineblock:mark-arrived') {
    if (localState !== 'receivingAwaitingConfirmation' || remoteState !== 'sending') {
      throw new Error(
        'Arrival acknowledgement can only be marked from receivingAwaitingConfirmation/sending.',
      );
    }
  }
}

function applyLineblockActionStates(
  actionType: LineblockActionType,
  localStation: StationDocument,
  localPieceId: string,
  remoteStation: StationDocument,
  remotePieceId: string,
) {
  if (actionType === 'lineblock:grant-consent') {
    setLineblockVisualState(localStation, localPieceId, 'receivingFree');
    setLineblockVisualState(remoteStation, remotePieceId, 'sendingFree');
    return;
  }

  if (actionType === 'lineblock:revoke-consent') {
    setLineblockVisualState(localStation, localPieceId, 'default');
    setLineblockVisualState(remoteStation, remotePieceId, 'default');
    return;
  }

  if (actionType === 'lineblock:mark-departed') {
    setLineblockVisualState(localStation, localPieceId, 'sending');
    setLineblockVisualState(remoteStation, remotePieceId, 'receiving');
    return;
  }

  setLineblockVisualState(localStation, localPieceId, 'receivingFree');
  setLineblockVisualState(remoteStation, remotePieceId, 'sendingFree');
}

async function setOutboundRouteLineblockStates(
  session: SessionDocument,
  station: StationDocument,
  sourcePieceId: string | null | undefined,
  signalPieceIds: string[] | null | undefined,
  routeClass: ActiveTrainRoute['routeClass'] | null | undefined,
  nextStates: {
    local: 'sending' | 'sendingFree';
    remote: 'receiving' | 'receivingFree' | 'receivingAwaitingConfirmation';
  },
) {
  if (routeClass !== 'platform-to-premain') {
    return null;
  }

  const localPremainIdFromSource =
    typeof sourcePieceId === 'string' &&
    (station.layout.pieces[sourcePieceId]?.type === 'premainSignal' ||
      station.layout.pieces[sourcePieceId]?.type === 'premainSignalNoOcp')
      ? sourcePieceId
      : null;
  const localPremainIdFromSignals =
    signalPieceIds?.find((pieceId) => {
      const type = station.layout.pieces[pieceId]?.type;
      return type === 'premainSignal' || type === 'premainSignalNoOcp';
    }) ?? null;
  const localPremainId = localPremainIdFromSource ?? localPremainIdFromSignals;
  if (!localPremainId) {
    return null;
  }

  const localPremainLink = Object.values(station.runtime.lineblockPremainLinks).find(
    (link) => link.premainSignalPieceId === localPremainId,
  );
  if (!localPremainLink) {
    return null;
  }

  const linked = getLinkedLineblock(station, session, localPremainLink.lineblockPieceId);
  if (!linked) {
    return null;
  }

  const remoteStation = await stationRepository.findBySessionAndStationId(
    session._id,
    linked.remote.stationId,
  );
  if (!remoteStation) {
    return null;
  }

  ensureStationRuntimeState(remoteStation);
  setLineblockVisualState(station, localPremainLink.lineblockPieceId, nextStates.local);
  setLineblockVisualState(remoteStation, linked.remote.pieceId, nextStates.remote);
  syncPremainAvailability(station);
  syncPremainAvailability(remoteStation);

  return remoteStation;
}

function createPendingAction(command: SwitchSetPositionCommand): PendingAction {
  return {
    id: command.commandId,
    type: command.type,
    status: 'queued',
    sessionId: command.sessionId,
    stationId: command.stationId,
    issuedAt: command.issuedAt,
    startedAt: null,
    dueAt: new Date(Date.now() + 3000).toISOString(),
    finishedAt: null,
    payload: command.payload,
  };
}

const ROUTE_BUILD_DELAY_MS = 2000;

function traversalUsesSwitchControl(
  pieceType: string,
  traversableState: string,
  slot: SwitchControlSlot,
) {
  if (!isCrossoverSwitchType(pieceType)) {
    return true;
  }

  return getRequiredSwitchMotorPositions(pieceType, traversableState)[slot] !== undefined;
}

function occupationUsesSwitchControl(
  pieceType: string,
  occupationState: string,
  slot: SwitchControlSlot,
) {
  return traversalUsesSwitchControl(pieceType, occupationState, slot);
}

function getActiveRouteFromSource(
  station: StationDocument,
  sourcePieceId: string,
  routeType: RuntimeRouteType,
) {
  return Object.values(station.runtime.activeTrainRoutes).find(
    (route) => route.sourcePieceId === sourcePieceId && route.routeType === routeType,
  );
}

function assertSwitchControlAvailable(
  station: StationDocument,
  session: SessionDocument,
  control: NonNullable<ReturnType<typeof getConnectedSwitchControl>>,
) {
  const switchPiece = station.layout.pieces[control.switchPieceId];
  if (!switchPiece) {
    throw new Error('The connected switch was not found.');
  }

  const activeRouteBlocks = Object.values(station.runtime.activeTrainRoutes).some((route) => {
    const reservedOccupation = route.reservedOccupations.find(
      (occupation) =>
        occupation.pieceId === control.switchPieceId &&
        occupationUsesSwitchControl(switchPiece.type, occupation.state, control.slot),
    );
    if (reservedOccupation) {
      return true;
    }

    const step = route.path.find((candidate) => candidate.pieceId === control.switchPieceId);
    return Boolean(
      step &&
      !switchPiece.state.groups.occupation &&
      traversalUsesSwitchControl(switchPiece.type, step.traversalState, control.slot),
    );
  });

  const pendingRouteBlocks = Object.values(station.runtime.pendingActions).some((action) => {
    if (action.type !== 'route:build-normal' && action.type !== 'route:build-shunt') {
      return false;
    }
    const path = Array.isArray(action.payload.path)
      ? (action.payload.path as ActiveTrainRoute['path'])
      : [];
    const step = path.find((candidate) => candidate.pieceId === control.switchPieceId);
    return Boolean(
      step && traversalUsesSwitchControl(switchPiece.type, step.traversalState, control.slot),
    );
  });

  const trainBlocks = Object.values(session.runtime.trains).some((train) =>
    train.occupiedSensors.some((sensor) => {
      if (sensor.stationId !== station.stationId || sensor.pieceId !== control.switchPieceId) {
        return false;
      }
      return traversalUsesSwitchControl(switchPiece.type, sensor.occupationState, control.slot);
    }),
  );

  const physicalOccupationBlocks = Object.values(session.runtime.physicalOccupations).some(
    (occupation) =>
      occupation.occupied &&
      occupation.stationId === station.stationId &&
      occupation.pieceId === control.switchPieceId &&
      (!occupation.traversalState ||
        traversalUsesSwitchControl(switchPiece.type, occupation.traversalState, control.slot)),
  );

  const switchActionBlocks = Object.values(station.runtime.pendingActions).some((action) => {
    if (action.type !== 'switch:set-position' || action.payload.pieceId === control.buttonPieceId) {
      return false;
    }
    const otherButtonId =
      typeof action.payload.pieceId === 'string' ? action.payload.pieceId : null;
    const otherControl = otherButtonId
      ? getConnectedSwitchControl(station.layout, otherButtonId)
      : null;
    return Boolean(
      otherControl?.switchPieceId === control.switchPieceId &&
      (!isCrossoverSwitchType(switchPiece.type) || otherControl.slot === control.slot),
    );
  });

  if (
    activeRouteBlocks ||
    pendingRouteBlocks ||
    trainBlocks ||
    physicalOccupationBlocks ||
    switchActionBlocks
  ) {
    throw new Error(
      'The switch cannot be operated while its controlled section is reserved or occupied.',
    );
  }
}

function toActionLog(station: StationDocument, action: PendingAction): StationActionLogDocument {
  return {
    _id: randomUUID(),
    sessionId: station.sessionId,
    stationId: station.stationId,
    actionId: action.id,
    type: action.type,
    status: action.status === 'queued' || action.status === 'running' ? 'cancelled' : action.status,
    issuedAt: action.issuedAt,
    startedAt: action.startedAt,
    finishedAt: action.finishedAt,
    payload: action.payload,
    result: action.result,
    error: action.error,
    debugLines: buildActionDebugLines(station, action),
  };
}

const switchActionTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function completeSwitchAction(actionId: string, sessionId: string, stationId: string) {
  const [station, rawSession] = await Promise.all([
    stationRepository.findBySessionAndStationId(sessionId, stationId),
    sessionRepository.findById(sessionId),
  ]);
  if (!station || !rawSession) {
    return;
  }
  const session = ensureSessionRuntimeState(rawSession);
  ensureStationRuntimeState(station);

  const action = station.runtime.pendingActions[actionId];
  if (!action) {
    return;
  }

  const buttonPieceId = typeof action.payload.pieceId === 'string' ? action.payload.pieceId : null;
  const position = action.payload.position;

  const layout = deserializeStationLayout(station.layout);
  const button = buttonPieceId ? layout.pieces[buttonPieceId] : null;
  const control = buttonPieceId ? getConnectedSwitchControl(layout, buttonPieceId) : null;
  const switchPiece = control ? layout.pieces[control.switchPieceId] : null;

  if (
    !buttonPieceId ||
    (position !== 'leftSet' && position !== 'rightSet') ||
    !button ||
    button.type !== 'switchButton' ||
    !control ||
    !switchPiece
  ) {
    action.status = 'failed';
    action.finishedAt = nowIso();
    action.error = {
      code: 'SWITCH_NOT_FOUND',
      message: 'The pending switch action no longer references a connected switch button.',
    };
  } else {
    const motorPosition: SwitchMotorPosition = position === 'leftSet' ? 'left' : 'right';
    const currentAlignment = station.runtime.switchAlignments[control.switchPieceId];
    const motorPositions = {
      ...getDefaultSwitchMotorPositions(switchPiece.type),
      ...(currentAlignment?.motorPositions ?? {}),
      [control.slot]: motorPosition,
    };
    const traversableState =
      getTraversableStateForMotorPositions(switchPiece.type, motorPositions) ?? 'disconnected';

    button.state.groups.switch = {
      state: position,
      variant: 'normal',
    };
    station.runtime.switchAlignments[control.switchPieceId] = {
      traversableState,
      motorPositions,
      updatedAt: nowIso(),
    };

    action.status = 'completed';
    action.finishedAt = nowIso();
    action.result = {
      pieceId: buttonPieceId,
      switchPieceId: control.switchPieceId,
      controlSlot: control.slot,
      position,
      traversableState,
    };
    station.layout = serializeStationLayout(layout);
  }

  const finalAction = { ...action };
  delete station.runtime.pendingActions[actionId];
  applyRuntimeState(station);
  applySessionTrainOccupations(station, session);
  bumpRevision(station);
  printDebugBlock(
    'web-debug',
    `${station.sessionId}/${station.stationId} applied ${finalAction.type}`,
    buildActionDebugLines(station, finalAction),
  );
  await stationActionLogRepository.create(toActionLog(station, finalAction));
  await saveStation(station);
}

function scheduleSwitchAction(station: StationDocument, action: PendingAction) {
  if (action.type !== 'switch:set-position' || !action.dueAt) {
    return;
  }

  const key = `${station.sessionId}:${station.stationId}:${action.id}`;
  if (switchActionTimers.has(key)) {
    return;
  }

  const delay = Math.max(0, new Date(action.dueAt).getTime() - Date.now());
  const timer = setTimeout(() => {
    switchActionTimers.delete(key);
    void completeSwitchAction(action.id, station.sessionId, station.stationId);
  }, delay);
  switchActionTimers.set(key, timer);
}

function scheduleStationSwitchActions(station: StationDocument) {
  Object.values(station.runtime.pendingActions).forEach((action) =>
    scheduleSwitchAction(station, action),
  );
}

async function completeRouteAction(actionId: string, sessionId: string, stationId: string) {
  const [station, rawSession] = await Promise.all([
    stationRepository.findBySessionAndStationId(sessionId, stationId),
    sessionRepository.findById(sessionId),
  ]);
  if (!station || !rawSession) {
    return;
  }
  const session = ensureSessionRuntimeState(rawSession);

  ensureStationRuntimeState(station);

  const action = station.runtime.pendingActions[actionId];
  if (!action) {
    return;
  }

  action.status = 'running';
  action.startedAt = nowIso();
  applyRuntimeState(station);
  bumpRevision(station);
  await saveStation(station);

  let linkedLineblockStation: StationDocument | null = null;

  try {
    if (action.type === 'route:build-normal' || action.type === 'route:build-shunt') {
      const route: ActiveTrainRoute = {
        id: action.id,
        routeType: action.payload.routeType as ActiveTrainRoute['routeType'],
        routeClass: action.payload.routeClass as ActiveTrainRoute['routeClass'],
        direction: action.payload.direction as ActiveTrainRoute['direction'],
        sourcePieceId: action.payload.sourcePieceId as string,
        targetPieceId: action.payload.targetPieceId as string,
        sourceControl:
          action.payload.sourceControl === 'normal' || action.payload.sourceControl === 'shunt'
            ? action.payload.sourceControl
            : undefined,
        targetControl:
          action.payload.targetControl === 'normal' || action.payload.targetControl === 'shunt'
            ? action.payload.targetControl
            : undefined,
        reservedOccupations: action.payload
          .reservedOccupations as ActiveTrainRoute['reservedOccupations'],
        signalPieceIds: action.payload.signalPieceIds as string[],
        targetPlatformDepartureSignalPieceId:
          (action.payload.targetPlatformDepartureSignalPieceId as string | null) ?? null,
        path: action.payload.path as ActiveTrainRoute['path'],
        passedSignalPieceIds: [],
        createdAt: nowIso(),
      };

      applyRouteSwitchAlignments(station, session, route);
      station.runtime.activeTrainRoutes[route.id] = route;
      linkedLineblockStation = await setOutboundRouteLineblockStates(
        session,
        station,
        route.sourcePieceId,
        route.signalPieceIds,
        route.routeClass,
        {
          local: 'sending',
          remote: 'receiving',
        },
      );
      action.result = { routeId: route.id };
      action.status = 'completed';
      action.finishedAt = nowIso();
    } else if (action.type === 'route:cancel-normal' || action.type === 'route:cancel-shunt') {
      const routeId = action.payload.routeId as string;
      const route = station.runtime.activeTrainRoutes[routeId];
      const occupiedPieceIds = new Set(
        Object.values(session.runtime.trains).flatMap((train) =>
          train.occupiedSensors
            .filter((sensor) => sensor.stationId === station.stationId)
            .map((sensor) => sensor.pieceId),
        ),
      );
      if (
        route?.reservedOccupations.some((occupation) => occupiedPieceIds.has(occupation.pieceId))
      ) {
        throw new Error('A route cannot be cancelled while a train occupies it.');
      }
      delete station.runtime.activeTrainRoutes[routeId];
      linkedLineblockStation = await setOutboundRouteLineblockStates(
        session,
        station,
        route?.sourcePieceId ?? (typeof action.payload.sourcePieceId === 'string'
          ? action.payload.sourcePieceId
          : null),
        route?.signalPieceIds ??
          (Array.isArray(action.payload.signalPieceIds)
            ? (action.payload.signalPieceIds as string[])
            : null),
        route?.routeClass ??
          (typeof action.payload.routeClass === 'string'
            ? (action.payload.routeClass as ActiveTrainRoute['routeClass'])
            : null),
        {
          local: 'sendingFree',
          remote: 'receivingFree',
        },
      );
      action.result = { routeId };
      action.status = 'completed';
      action.finishedAt = nowIso();
    }
  } catch (error) {
    linkedLineblockStation = await setOutboundRouteLineblockStates(
      session,
      station,
      typeof action.payload.sourcePieceId === 'string' ? action.payload.sourcePieceId : null,
      Array.isArray(action.payload.signalPieceIds)
        ? (action.payload.signalPieceIds as string[])
        : null,
      typeof action.payload.routeClass === 'string'
        ? (action.payload.routeClass as ActiveTrainRoute['routeClass'])
        : null,
      {
        local: 'sendingFree',
        remote: 'receivingFree',
      },
    );
    action.status = 'failed';
    action.finishedAt = nowIso();
    action.error = {
      code: 'ROUTE_ACTION_FAILED',
      message: error instanceof Error ? error.message : 'Route action failed.',
    };
  }

  const finalAction = { ...action };
  delete station.runtime.pendingActions[action.id];
  applyRuntimeState(station);
  applySessionTrainOccupations(station, session);
  bumpRevision(station);
  printDebugBlock(
    'web-debug',
    `${station.sessionId}/${station.stationId} applied ${finalAction.type}`,
    buildActionDebugLines(station, finalAction),
  );
  await stationActionLogRepository.create(toActionLog(station, finalAction));
  await saveStation(station);
  if (linkedLineblockStation) {
    applyRuntimeState(linkedLineblockStation);
    applySessionTrainOccupations(linkedLineblockStation, session);
    bumpRevision(linkedLineblockStation);
    await saveStation(linkedLineblockStation);
  }
}

const trainMovementTimers = new Map<string, ReturnType<typeof setTimeout>>();

function getTrainTimerKey(sessionId: string, trainId: string) {
  return `${sessionId}:${trainId}`;
}

function scheduleTrainMovement(sessionId: string, train: MockTrain) {
  if (!train.movement) {
    return;
  }

  const key = getTrainTimerKey(sessionId, train.id);
  const existing = trainMovementTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const delay = Math.max(0, new Date(train.movement.dueAt).getTime() - Date.now());
  const timer = setTimeout(() => {
    trainMovementTimers.delete(key);
    void advanceTrainMovement(sessionId, train.id);
  }, delay);
  trainMovementTimers.set(key, timer);
}

function scheduleSessionTrainMovements(session: SessionDocument) {
  Object.values(session.runtime.trains).forEach((train) =>
    scheduleTrainMovement(session._id, train),
  );
}

function getOccupiedState(step: TrainMovementStep) {
  if (!step.occupationState) {
    return null;
  }
  return step.occupationState === 'reserved' ? 'occupied' : step.occupationState;
}

function assertMovementSensorsAvailable(
  session: SessionDocument,
  trainId: string,
  stations: Map<string, StationDocument>,
  steps: TrainMovementStep[],
) {
  const otherSensors = Object.values(session.runtime.trains)
    .filter((train) => train.id !== trainId)
    .flatMap((train) => train.occupiedSensors);

  steps.forEach((step) => {
    const occupiedState = getOccupiedState(step);
    if (!occupiedState) {
      return;
    }

    const collision = otherSensors.find(
      (sensor) => sensor.stationId === step.stationId && sensor.pieceId === step.pieceId,
    );
    if (!collision) {
      return;
    }

    const piece = stations.get(step.stationId)?.layout.pieces[step.pieceId];
    if (
      piece?.type !== 'crossoverSwitch' ||
      crossoverTraversalStatesConflict(collision.occupationState, occupiedState)
    ) {
      throw new Error(`Movement is blocked by another train on segment "${step.pieceId}".`);
    }
  });
}

function assertRouteSignalPermitsMovement(route: ActiveTrainRoute, steps: TrainMovementStep[]) {
  const nextSignal = steps.find((step) => step.signalPieceId)?.signalPieceId;
  if (nextSignal && route.passedSignalPieceIds.includes(nextSignal)) {
    throw new Error('The next signal is at danger; rebuild the route before moving this train.');
  }
}

function claimExistingTrainSensorsForRoute(
  train: MockTrain,
  route: ActiveTrainRoute,
  stationId: string,
) {
  const reservedPieceIds = new Set(
    route.reservedOccupations.map((occupation) => occupation.pieceId),
  );
  train.occupiedSensors.forEach((sensor) => {
    if (!sensor.routeId && sensor.stationId === stationId && reservedPieceIds.has(sensor.pieceId)) {
      sensor.routeId = route.id;
    }
  });
}

async function saveTrainStationSnapshots(
  session: SessionDocument,
  stations: Map<string, StationDocument>,
  stationIds: Set<string>,
) {
  for (const stationId of stationIds) {
    const station = stations.get(stationId);
    if (!station) {
      continue;
    }
    ensureStationRuntimeState(station);
    applySessionTrainOccupations(station, session);
    bumpRevision(station);
    await saveStation(station);
  }
}

function markPassedSignal(station: StationDocument, routeId: string, signalPieceId: string) {
  const route = station.runtime.activeTrainRoutes[routeId];
  if (route && !route.passedSignalPieceIds.includes(signalPieceId)) {
    route.passedSignalPieceIds.push(signalPieceId);
  }

  if (station.runtime.activePrivolavaciaSignals[signalPieceId]) {
    cancelPrivolavaciaSignal(station, signalPieceId);
  }
}

function releaseRouteReservationsForClearedOccupation(
  station: StationDocument,
  pieceId: string,
  traversalState: string | null,
) {
  Object.values(station.runtime.activeTrainRoutes).forEach((route) => {
    route.reservedOccupations = route.reservedOccupations.filter((occupation) => {
      if (occupation.pieceId !== pieceId) {
        return true;
      }

      if (traversalState === null) {
        return false;
      }

      return occupation.state !== traversalState;
    });
  });
}

function releaseReservationsBehindClearedSensor(
  stations: Map<string, StationDocument>,
  clearedSensors: MockTrain['occupiedSensors'],
  occupiedSensors: MockTrain['occupiedSensors'],
) {
  const occupiedByRoute = new Map<string, Set<string>>();
  occupiedSensors.forEach((sensor) => {
    if (!sensor.routeId) {
      return;
    }

    const key = `${sensor.stationId}\0${sensor.routeId}`;
    const occupiedPieceIds = occupiedByRoute.get(key) ?? new Set<string>();
    occupiedPieceIds.add(sensor.pieceId);
    occupiedByRoute.set(key, occupiedPieceIds);
  });

  clearedSensors.forEach((sensor) => {
    if (!sensor.routeId) {
      return;
    }

    const station = stations.get(sensor.stationId);
    if (!station) {
      return;
    }

    const route = station.runtime.activeTrainRoutes[sensor.routeId];
    if (!route) {
      return;
    }

    const clearedIndex = route.path.findIndex((step) => step.pieceId === sensor.pieceId);
    if (clearedIndex < 0) {
      return;
    }

    const occupiedPieceIds = occupiedByRoute.get(`${sensor.stationId}\0${sensor.routeId}`) ?? new Set();
    route.reservedOccupations = route.reservedOccupations.filter((occupation) => {
      const occupationIndex = route.path.findIndex((step) => step.pieceId === occupation.pieceId);
      if (occupationIndex < 0 || occupationIndex > clearedIndex) {
        return true;
      }

      return occupiedPieceIds.has(occupation.pieceId);
    });
  });
}

function clearCompletedRouteIfFullyReleased(
  station: StationDocument,
  routeId: string,
) {
  const route = station.runtime.activeTrainRoutes[routeId];
  if (!route) {
    return;
  }

  if (route.reservedOccupations.length > 0) {
    return;
  }

  delete station.runtime.activeTrainRoutes[routeId];
}

function finalizeReleasedRoutes(
  stations: Map<string, StationDocument>,
  clearedSensors: MockTrain['occupiedSensors'],
) {
  const releasedRouteKeys = new Set<string>();

  clearedSensors.forEach((sensor) => {
    if (!sensor.routeId) {
      return;
    }

    releasedRouteKeys.add(`${sensor.stationId}\0${sensor.routeId}`);
  });

  releasedRouteKeys.forEach((key) => {
    const [stationId, routeId] = key.split('\0', 2);
    const station = stations.get(stationId);
    if (!station) {
      return;
    }

    clearCompletedRouteIfFullyReleased(station, routeId);
  });
}

function markRouteSignalPassedByOccupiedPiece(
  station: StationDocument,
  pieceId: string,
  traversalState: string | null,
) {
  Object.values(station.runtime.activeTrainRoutes).forEach((route) => {
    const occupiedStepIndex = route.path.findIndex((step) => {
      if (step.pieceId !== pieceId) {
        return false;
      }

      if (traversalState === null || step.occupationState === null) {
        return true;
      }

      return step.occupationState === traversalState;
    });
    if (occupiedStepIndex < 0) {
      return;
    }

    const occupiedStep = route.path[occupiedStepIndex];
    if (occupiedStep.signalPieceId === pieceId) {
      const signalPieceType = station.layout.pieces[pieceId]?.type;
      if (signalPieceType === 'premainSignal' || signalPieceType === 'premainSignalNoOcp') {
        return;
      }
      markPassedSignal(station, route.id, pieceId);
      return;
    }

    // Shunt signals without occupation sensors must fall back to the first
    // occupied step after the signal on the same shunting route.
    if (route.routeType !== 'shunt' || !occupiedStep.occupationState) {
      return;
    }

    for (let index = occupiedStepIndex - 1; index >= 0; index -= 1) {
      const candidate = route.path[index];
      if (candidate.occupationState) {
        break;
      }

      const signalPieceId = candidate.signalPieceId;
      if (!signalPieceId) {
        continue;
      }

      const signalPieceType = station.layout.pieces[signalPieceId]?.type;
      if (
        signalPieceType === 'shuntSignalNoOcp' ||
        signalPieceType === 'shuntSignalButtonBuffer'
      ) {
        markPassedSignal(station, route.id, signalPieceId);
      }
      break;
    }
  });
}

function applyRouteProgressFromOccupationEvent(
  station: StationDocument,
  pieceId: string,
  traversalState: string | null,
  occupied: boolean,
) {
  if (occupied) {
    markRouteSignalPassedByOccupiedPiece(station, pieceId, traversalState);
    return;
  }

  releaseRouteReservationsForClearedOccupation(station, pieceId, traversalState);
}

function applyRouteProgressFromMockSensors(
  stations: Map<string, StationDocument>,
  sensors: MockTrain['occupiedSensors'],
  occupied: boolean,
) {
  sensors.forEach((sensor) => {
    const station = stations.get(sensor.stationId);
    if (!station) {
      return;
    }

    applyRouteProgressFromOccupationEvent(
      station,
      sensor.pieceId,
      sensor.occupationState ?? null,
      occupied,
    );
  });
}

function updateLineblockArrivalEligibility(
  session: SessionDocument,
  train: MockTrain,
  stations: Map<string, StationDocument>,
) {
  const transit = train.lineblockTransit;
  if (!transit) {
    return;
  }

  const receivingStation = stations.get(transit.toStationId);
  if (!receivingStation) {
    return;
  }

  const receivingStationSensors = train.occupiedSensors.filter(
    (sensor) => sensor.stationId === transit.toStationId,
  );
  if (receivingStationSensors.length === 0) {
    return;
  }

  const protectedPieceIds = new Set(transit.protectedPieceIds);
  const completelyPastEntry = receivingStationSensors.every((sensor) => {
    return !protectedPieceIds.has(sensor.pieceId);
  });

  if (completelyPastEntry) {
    setLineblockVisualState(
      receivingStation,
      transit.receivingLineblockPieceId,
      'receivingAwaitingConfirmation',
    );
    session.runtime.lineblocks[transit.linkId] = {
      arrivalAcknowledgementEligible: true,
      trainId: train.id,
      updatedAt: nowIso(),
    };
  }
}

async function advanceTrainMovement(sessionId: string, trainId: string) {
  const rawSession = await sessionRepository.findById(sessionId);
  if (!rawSession) {
    return;
  }
  const session = ensureSessionRuntimeState(rawSession);
  const train = session.runtime.trains[trainId];
  const movement = train?.movement;
  if (!train || !movement) {
    return;
  }

  if (new Date(movement.dueAt).getTime() > Date.now()) {
    scheduleTrainMovement(sessionId, train);
    return;
  }

  const stationList = await stationRepository.listBySessionId(sessionId);
  const stations = new Map(
    stationList.map((station) => [station.stationId, ensureStationRuntimeState(station)]),
  );
  const step = movement.steps[movement.nextStepIndex];
  if (!step) {
    train.status = 'idle';
    train.movement = null;
    train.updatedAt = nowIso();
    session.updatedAt = nowIso();
    await saveSession(session);
    return;
  }

  const previousStep =
    movement.nextStepIndex > 0 ? movement.steps[movement.nextStepIndex - 1] : null;
  const affectedStationIds = new Set(train.occupiedSensors.map((sensor) => sensor.stationId));
  affectedStationIds.add(step.stationId);

  const previousSensors = [...train.occupiedSensors];
  const occupiedState = getOccupiedState(step);
  if (occupiedState) {
    train.occupiedSensors = [
      {
        stationId: step.stationId,
        pieceId: step.pieceId,
        occupationState: occupiedState,
        routeId: step.routeId,
      },
      ...train.occupiedSensors.filter(
        (sensor) => sensor.stationId !== step.stationId || sensor.pieceId !== step.pieceId,
      ),
    ].slice(0, train.length);
  }
  const retainedSensorKeys = new Set(
    train.occupiedSensors.map((sensor) => `${sensor.stationId}:${sensor.pieceId}`),
  );
  const clearedSensors = previousSensors.filter(
    (sensor) => !retainedSensorKeys.has(`${sensor.stationId}:${sensor.pieceId}`),
  );
  applyRouteProgressFromMockSensors(stations, clearedSensors, false);
  if (occupiedState) {
    const stepStation = stations.get(step.stationId);
    if (stepStation) {
      applyRouteProgressFromOccupationEvent(
        stepStation,
        step.pieceId,
        occupiedState,
        true,
      );
    }
  }
  releaseReservationsBehindClearedSensor(stations, clearedSensors, train.occupiedSensors);
  finalizeReleasedRoutes(stations, clearedSensors);

  train.location = {
    stationId: step.stationId,
    pieceId: step.pieceId,
    routeId: step.routeId,
    routeStepIndex: step.routeStepIndex,
  };
  if (previousStep?.signalPieceId) {
    affectedStationIds.add(previousStep.stationId);
  }

  movement.nextStepIndex += 1;
  updateLineblockArrivalEligibility(session, train, stations);
  train.updatedAt = nowIso();
  if (movement.nextStepIndex >= movement.steps.length) {
    train.status = 'idle';
    train.movement = null;
  } else {
    movement.dueAt = new Date(Date.now() + 2000).toISOString();
  }
  session.updatedAt = nowIso();
  await saveSession(session);
  await saveTrainStationSnapshots(session, stations, affectedStationIds);

  if (train.movement) {
    scheduleTrainMovement(sessionId, train);
  }
}

export const stationService = {
  async createMockSession() {
    const createdAt = nowIso();
    const session: SessionDocument = {
      _id: createSessionId('mock'),
      createdAt,
      updatedAt: createdAt,
      status: 'active',
      mockMode: true,
      interpreter: { kind: 'mock' },
      topology: {
        lineblockLinks: {},
      },
      runtime: {
        trains: {},
        lineblocks: {},
        physicalOccupations: {},
      },
    };

    await sessionRepository.create(session);
    return session;
  },

  async exportSessionSchema(sessionId: string): Promise<SessionSchemaDocument> {
    const [rawSession, stations] = await Promise.all([
      sessionRepository.findById(sessionId),
      stationRepository.listBySessionId(sessionId),
    ]);
    if (!rawSession) {
      throw new Error('Session not found.');
    }

    const session = ensureSessionRuntimeState(rawSession);
    return {
      version: 1,
      stations: stations.map((station) => ({
        stationId: station.stationId,
        layout: normalizeStationLayout(station.layout),
      })),
      lineblockLinks: Object.values(session.topology.lineblockLinks).map((link) => ({
        a: link.a,
        b: link.b,
        defaultFlow: normalizeLineblockDefaultFlow(link.defaultFlow),
      })),
    };
  },

  async importSessionSchema(schema: SessionSchemaDocument) {
    const createdAt = nowIso();
    const sessionId = createSessionId('session');
    const session: SessionDocument = {
      _id: sessionId,
      createdAt,
      updatedAt: createdAt,
      status: 'active',
      mockMode: true,
      interpreter: { kind: 'mock' },
      topology: {
        lineblockLinks: {},
      },
      runtime: {
        trains: {},
        lineblocks: {},
        physicalOccupations: {},
      },
    };

    await sessionRepository.create(session);

    for (const stationEntry of schema.stations) {
      await this.ensureStation(sessionId, stationEntry.stationId, stationEntry.layout);
    }

    for (const link of schema.lineblockLinks) {
      await this.createLineblockLink(sessionId, link);
    }

    const importedSession = await this.getSession(sessionId);
    if (!importedSession) {
      throw new Error('Imported session could not be loaded.');
    }
    return importedSession;
  },

  async savePlaceTemplate(universeId: string, placeId: string, sessionId: string) {
    const schema = await this.exportSessionSchema(sessionId);
    const existing = await placeTemplateRepository.findByUniverseAndPlaceId(universeId, placeId);
    const timestamp = nowIso();
    const template: PlaceTemplateDocument = {
      _id: `${universeId}:${placeId}`,
      universeId,
      placeId,
      schema,
      revision: (existing?.revision ?? 0) + 1,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    await placeTemplateRepository.save(template);
    return template;
  },

  async getPlaceTemplate(universeId: string, placeId: string) {
    return placeTemplateRepository.findByUniverseAndPlaceId(universeId, placeId);
  },

  async registerRobloxSession(sessionId: string, universeId: string, placeId: string, serverId: string) {
    const heartbeatAt = nowIso();
    const existing = await sessionRepository.findById(sessionId);
    if (existing) {
      const session = ensureSessionRuntimeState(existing);
      if (
        session.interpreter.kind !== 'roblox' ||
        session.interpreter.universeId !== universeId ||
        session.interpreter.placeId !== placeId ||
        session.interpreter.serverId !== serverId
      ) {
        throw new Error('Session ID is already registered to a different runtime.');
      }
      session.interpreter.heartbeat.lastHeartbeatAt = heartbeatAt;
      session.updatedAt = heartbeatAt;
      await sessionRepository.save(session);
      return session;
    }

    const template = await placeTemplateRepository.findByUniverseAndPlaceId(universeId, placeId);
    if (!template) {
      throw new Error(`No Roblox map template is configured for UniverseId ${universeId} and PlaceId ${placeId}.`);
    }

    const createdAt = nowIso();
    const session: SessionDocument = {
      _id: sessionId,
      createdAt,
      updatedAt: createdAt,
      status: 'active',
      mockMode: false,
      interpreter: {
        kind: 'roblox',
        universeId,
        placeId,
        serverId,
        heartbeat: {
          lastHeartbeatAt: heartbeatAt,
        },
      },
      topology: { lineblockLinks: {} },
      runtime: {
        trains: {},
        lineblocks: {},
        physicalOccupations: {},
      },
    };

    await sessionRepository.create(session);
    for (const stationEntry of template.schema.stations) {
      await this.ensureStation(sessionId, stationEntry.stationId, stationEntry.layout, true);
    }
    for (const link of template.schema.lineblockLinks) {
      await this.createLineblockLink(sessionId, link, true);
    }

    await initializeRobloxRuntimeState(sessionId, () => buildRobloxPhysicalSnapshot(sessionId));

    return session;
  },

  async heartbeatRobloxSession(sessionId: string, serverId: string) {
    const existing = await sessionRepository.findById(sessionId);
    if (!existing) {
      throw new Error('Session not found.');
    }

    const session = ensureSessionRuntimeState(existing);
    if (session.interpreter.kind !== 'roblox') {
      throw new Error('Heartbeat is only accepted for Roblox sessions.');
    }
    if (session.interpreter.serverId !== serverId) {
      throw new Error('Session heartbeat came from a different Roblox server.');
    }

    session.interpreter.heartbeat.lastHeartbeatAt = nowIso();
    session.updatedAt = session.interpreter.heartbeat.lastHeartbeatAt;
    await sessionRepository.save(session);

    return {
      sessionId: session._id,
      lastHeartbeatAt: session.interpreter.heartbeat.lastHeartbeatAt,
      isLive: true,
    };
  },

  async getRobloxPhysicalSnapshot(sessionId: string): Promise<RobloxPhysicalSnapshot> {
    return buildRobloxPhysicalSnapshot(sessionId);
  },

  async getRobloxRuntimeInit(sessionId: string) {
    let state = await robloxRuntimeStateRepository.findBySessionId(sessionId);
    if (!state) {
      await initializeRobloxRuntimeState(sessionId, () => buildRobloxPhysicalSnapshot(sessionId));
      state = await robloxRuntimeStateRepository.findBySessionId(sessionId);
    }
    const snapshot = await buildRobloxPhysicalSnapshot(sessionId);

    return {
      snapshot,
      cursor: state?.latestSequence ?? 0,
    };
  },

  async getRobloxRuntimeUpdates(sessionId: string, afterSequence: number) {
    const rawSession = await sessionRepository.findById(sessionId);
    if (!rawSession) {
      throw new Error('Session not found.');
    }

    const session = ensureSessionRuntimeState(rawSession);
    if (session.interpreter.kind !== 'roblox') {
      throw new Error('The requested session is not a Roblox session.');
    }

    await robloxRuntimeUpdateRepository.deleteUpToSequence(sessionId, afterSequence);
    const updates = await robloxRuntimeUpdateRepository.listAfterSequence(sessionId, afterSequence);
    const cursor = updates.length > 0 ? updates[updates.length - 1].sequence : afterSequence;

    return {
      sessionId,
      cursor,
      generatedAt: nowIso(),
      updates: updates.map((update) => ({
        sequence: update.sequence,
        stationId: update.stationId,
        pieceId: update.pieceId,
        piece: update.piece,
      })),
    };
  },

  async applyRobloxOccupation(
    sessionId: string,
    input: {
      eventId: string;
      stationId: string;
      pieceId: string;
      traversalState?: string | null;
      occupied: boolean;
      observedAt: string;
    },
  ) {
    const stationId = normalizeRobloxStationId(input.stationId);
    const [rawSession, station] = await Promise.all([
      sessionRepository.findById(sessionId),
      stationRepository.findBySessionAndStationId(sessionId, stationId),
    ]);
    if (!rawSession || !station) {
      throw new Error('Station not found.');
    }
    const session = ensureSessionRuntimeState(rawSession);
    if (session.interpreter.kind !== 'roblox') {
      throw new Error('Occupation events are only accepted for Roblox sessions.');
    }
    ensureStationRuntimeState(station);

    const piece = station.layout.pieces[input.pieceId];
    if (!piece?.state.groups.occupation) {
      // One physical Roblox occupancy sensor may be linked to visual/control
      // tiles alongside occupation-capable tiles. Ignore those non-sensor
      // links so they cannot reject the complete reported sensor batch.
      return { applied: false, station };
    }

    const traversalState = input.traversalState ?? null;
    const occupationKey = `${stationId}:${input.pieceId}:${traversalState ?? '*'}`;
    const current = session.runtime.physicalOccupations[occupationKey];
    if (current && Date.parse(current.observedAt) > Date.parse(input.observedAt)) {
      return { applied: false, station };
    }

    session.runtime.physicalOccupations[occupationKey] = {
      stationId,
      pieceId: input.pieceId,
      traversalState,
      occupied: input.occupied,
      eventId: input.eventId,
      observedAt: input.observedAt,
    };
    session.updatedAt = nowIso();

    applyRouteProgressFromOccupationEvent(station, input.pieceId, traversalState, input.occupied);

    applyRuntimeStateWithTrainOccupations(station, session);
    bumpRevision(station);
    await sessionRepository.save(session);
    await saveStation(station);
    return { applied: true, station };
  },

  async applyRobloxSwitchFeedback(
    sessionId: string,
    input: {
      stationId: string;
      pieceId: string;
      controlSlot: SwitchControlSlot;
      position: SwitchMotorPosition;
      observedAt: string;
    },
  ) {
    const stationId = normalizeRobloxStationId(input.stationId);
    const [rawSession, station] = await Promise.all([
      sessionRepository.findById(sessionId),
      stationRepository.findBySessionAndStationId(sessionId, stationId),
    ]);
    if (!rawSession || !station) {
      throw new Error('Station not found.');
    }
    const session = ensureSessionRuntimeState(rawSession);
    if (session.interpreter.kind !== 'roblox') {
      throw new Error('Switch feedback is only accepted for Roblox sessions.');
    }
    ensureStationRuntimeState(station);

    const switchPiece = station.layout.pieces[input.pieceId];
    if (!switchPiece || !isPhysicalSwitchPieceType(switchPiece.type)) {
      throw new Error(`Physical switch piece "${input.pieceId}" was not found.`);
    }
    const defaultPositions = getDefaultSwitchMotorPositions(switchPiece.type);
    if (!(input.controlSlot in defaultPositions)) {
      throw new Error(`Switch does not have a ${input.controlSlot} motor.`);
    }

    const current = station.runtime.switchAlignments[input.pieceId];
    if (current && Date.parse(current.updatedAt) > Date.parse(input.observedAt)) {
      return { applied: false, station };
    }
    const motorPositions = {
      ...defaultPositions,
      ...(current?.motorPositions ?? {}),
      [input.controlSlot]: input.position,
    };
    station.runtime.switchAlignments[input.pieceId] = {
      motorPositions,
      traversableState:
        getTraversableStateForMotorPositions(switchPiece.type, motorPositions) ?? 'disconnected',
      updatedAt: input.observedAt,
    };

    applyRuntimeStateWithTrainOccupations(station, session);
    bumpRevision(station);
    await saveStation(station);
    return { applied: true, station };
  },

  async ensureStation(
    sessionId: string,
    stationId: string,
    layoutOverride?: StationDocument['layout'],
    suppressRuntimeNotify = false,
  ) {
    const existing = await stationRepository.findBySessionAndStationId(sessionId, stationId);
    if (existing) {
      return ensureStationRuntimeState(existing);
    }

    const station = createStationDocument(sessionId, stationId, layoutOverride);
    await stationRepository.create(station);
    if (!suppressRuntimeNotify) {
      void notifyRuntimeInterpreter(sessionId, () => buildRobloxPhysicalSnapshot(sessionId));
    }
    return station;
  },

  async getStation(sessionId: string, stationId: string) {
    const [station, rawSession] = await Promise.all([
      stationRepository.findBySessionAndStationId(sessionId, stationId),
      sessionRepository.findById(sessionId),
    ]);
    if (!station || !rawSession) {
      return null;
    }
    const session = ensureSessionRuntimeState(rawSession);
    ensureStationRuntimeState(station);
    applySessionTrainOccupations(station, session);
    scheduleSessionTrainMovements(session);
    scheduleStationSwitchActions(station);
    return station;
  },

  async listStations(sessionId: string) {
    const [stations, rawSession] = await Promise.all([
      stationRepository.listBySessionId(sessionId),
      sessionRepository.findById(sessionId),
    ]);
    if (!rawSession) {
      return [];
    }
    const session = ensureSessionRuntimeState(rawSession);
    scheduleSessionTrainMovements(session);
    return stations.map((station) => {
      ensureStationRuntimeState(station);
      applySessionTrainOccupations(station, session);
      scheduleStationSwitchActions(station);
      return station;
    });
  },

  async getSession(sessionId: string) {
    const session = await sessionRepository.findById(sessionId);
    if (!session) {
      return null;
    }
    ensureSessionRuntimeState(session);
    scheduleSessionTrainMovements(session);
    return session;
  },

  async listLiveRobloxSessions() {
    const [sessions, stations] = await Promise.all([
      sessionRepository.listActiveRobloxSessions(),
      stationRepository.listAll(),
    ]);
    const now = Date.now();
    const stationsBySessionId = new Map<string, Array<{ stationId: string }>>();

    stations.forEach((station) => {
      const existing = stationsBySessionId.get(station.sessionId) ?? [];
      existing.push({ stationId: station.stationId });
      stationsBySessionId.set(station.sessionId, existing);
    });

    return sessions
      .map((rawSession) => {
      const session = ensureSessionRuntimeState(rawSession);
      const lastHeartbeatAt = session.interpreter.kind === 'roblox'
        ? session.interpreter.heartbeat.lastHeartbeatAt
        : null;

      return {
        sessionId: session._id,
        placeId: session.interpreter.kind === 'roblox' ? session.interpreter.placeId : '',
        serverId: session.interpreter.kind === 'roblox' ? session.interpreter.serverId : '',
        lastHeartbeatAt: lastHeartbeatAt ?? session.updatedAt,
        isLive: isRobloxSessionLive(session, now),
        stations: (stationsBySessionId.get(session._id) ?? []).sort((a, b) =>
          a.stationId.localeCompare(b.stationId),
        ),
      };
      })
      .filter((session) => session.isLive);
  },

  async runAdminRecovery(
    sessionId: string,
    action: 'clear-physical-occupations' | 'clear-routes' | 'reset-session-state',
    stationId?: string,
  ) {
    const [rawSession, rawStations] = await Promise.all([
      sessionRepository.findById(sessionId),
      stationRepository.listBySessionId(sessionId),
    ]);
    if (!rawSession) {
      throw new Error('Session not found.');
    }

    const session = ensureSessionRuntimeState(rawSession);
    const stations = rawStations.map(ensureStationRuntimeState);
    const targetStations = stationId
      ? stations.filter((station) => station.stationId === stationId)
      : stations;
    if (stationId && targetStations.length === 0) {
      throw new Error('Station not found.');
    }
    const affectedStationIds = new Set<string>();

    if (action === 'clear-physical-occupations' || action === 'reset-session-state') {
      session.runtime.physicalOccupations = Object.fromEntries(
        Object.entries(session.runtime.physicalOccupations).filter(
          ([, occupation]) => stationId && occupation.stationId !== stationId,
        ),
      );
      targetStations.forEach((station) => affectedStationIds.add(station.stationId));
    }

    if (action === 'clear-routes' || action === 'reset-session-state') {
      targetStations.forEach((station) => {
        station.runtime.activeTrainRoutes = {};
        station.runtime.routeSelection = null;
        Object.entries(station.runtime.pendingActions).forEach(([actionId, pending]) => {
          if (pending.type.startsWith('route:')) {
            delete station.runtime.pendingActions[actionId];
          }
        });
        affectedStationIds.add(station.stationId);
      });
    }

    if (action === 'reset-session-state') {
      if (!stationId) {
        Object.keys(session.runtime.trains).forEach((trainId) => {
          const timer = trainMovementTimers.get(getTrainTimerKey(sessionId, trainId));
          if (timer) clearTimeout(timer);
          trainMovementTimers.delete(getTrainTimerKey(sessionId, trainId));
        });
        session.runtime.trains = {};
      }
      Object.keys(session.runtime.lineblocks)
        .filter((linkId) => {
          const link = session.topology.lineblockLinks[linkId];
          return !stationId || link?.a.stationId === stationId || link?.b.stationId === stationId;
        })
        .forEach((linkId) => {
        session.runtime.lineblocks[linkId] = {
          arrivalAcknowledgementEligible: false,
          trainId: null,
          updatedAt: nowIso(),
        };
        });
      targetStations.forEach((station) => {
        Object.keys(station.runtime.pendingActions).forEach((actionId) => {
          const timerKey = `${sessionId}:${station.stationId}:${actionId}`;
          const timer = switchActionTimers.get(timerKey);
          if (timer) clearTimeout(timer);
          switchActionTimers.delete(timerKey);
        });
        station.runtime.pendingActions = {};
        station.runtime.activePrivolavaciaSignals = {};
        station.runtime.privolavaciaSelection = null;
        station.runtime.switchAlignments = {};
        Object.values(station.layout.pieces).forEach((piece) => {
          const tile = tiles[piece.type];
          if (tile) piece.state.groups = getInitialGroupSelections(tile, stateGroups);
        });
        affectedStationIds.add(station.stationId);
      });
      Object.values(session.topology.lineblockLinks)
        .filter((link) => !stationId || link.a.stationId === stationId || link.b.stationId === stationId)
        .forEach((link) => {
        const stationA = stations.find((station) => station.stationId === link.a.stationId);
        const stationB = stations.find((station) => station.stationId === link.b.stationId);
        if (stationA && stationB) {
          applyLineblockDefaultFlowToStations(link.defaultFlow, stationA, link.a.pieceId, stationB, link.b.pieceId);
          affectedStationIds.add(stationA.stationId);
          affectedStationIds.add(stationB.stationId);
        }
        });
    }

    session.updatedAt = nowIso();
    await saveSession(session, { skipRuntimeNotify: true });
    await Promise.all(
      stations.map(async (station) => {
        if (!affectedStationIds.has(station.stationId)) return;
        applyRuntimeStateWithTrainOccupations(station, session);
        bumpRevision(station);
        await saveStation(station, { skipRuntimeNotify: true });
      }),
    );
    void notifyRuntimeInterpreter(sessionId, () => buildRobloxPhysicalSnapshot(sessionId));

    return { action, stationId: stationId ?? null, stationsUpdated: affectedStationIds.size };
  },

  async createMockTrain(
    sessionId: string,
    input: {
      category: string;
      number: string;
      length: number;
      stationId: string;
      pieceId: string;
      direction: TrainDirection;
    },
  ) {
    const [rawSession, station] = await Promise.all([
      sessionRepository.findById(sessionId),
      stationRepository.findBySessionAndStationId(sessionId, input.stationId),
    ]);
    if (!rawSession || !station) {
      throw new Error('Session or starting station was not found.');
    }
    const session = ensureSessionRuntimeState(rawSession);
    ensureStationRuntimeState(station);

    const trainKey = `${input.category.trim()} ${input.number.trim()}`.toLocaleLowerCase();
    if (
      Object.values(session.runtime.trains).some(
        (train) => `${train.category} ${train.number}`.toLocaleLowerCase() === trainKey,
      )
    ) {
      throw new Error('A train with this category and number already exists in the session.');
    }

    const occupiedSensors = getSpawnSensorPositions(
      station,
      input.pieceId,
      input.direction,
      input.length,
    );
    const occupiedKeys = new Set(
      Object.values(session.runtime.trains).flatMap((train) =>
        train.occupiedSensors.map((sensor) => `${sensor.stationId}:${sensor.pieceId}`),
      ),
    );
    const collision = occupiedSensors.find((sensor) =>
      occupiedKeys.has(`${sensor.stationId}:${sensor.pieceId}`),
    );
    if (collision) {
      throw new Error(`Starting segment "${collision.pieceId}" is occupied by another train.`);
    }

    const createdAt = nowIso();
    const train: MockTrain = {
      id: randomUUID(),
      category: input.category.trim(),
      number: input.number.trim(),
      length: input.length,
      direction: input.direction,
      status: 'idle',
      occupiedSensors,
      location: {
        stationId: input.stationId,
        pieceId: input.pieceId,
        routeId: null,
        routeStepIndex: null,
      },
      lineblockTransit: null,
      movement: null,
      createdAt,
      updatedAt: createdAt,
    };
    session.runtime.trains[train.id] = train;
    session.updatedAt = createdAt;
    await saveSession(session);

    applyRuntimeState(station);
    applySessionTrainOccupations(station, session);
    bumpRevision(station);
    await saveStation(station);
    return train;
  },

  async moveMockTrain(sessionId: string, trainId: string) {
    const rawSession = await sessionRepository.findById(sessionId);
    if (!rawSession) {
      throw new Error('Session not found.');
    }
    const session = ensureSessionRuntimeState(rawSession);
    const train = session.runtime.trains[trainId];
    if (!train) {
      throw new Error('Train not found.');
    }
    if (train.status === 'moving' || train.movement) {
      throw new Error('The train is already moving.');
    }

    const stationList = await stationRepository.listBySessionId(sessionId);
    const stations = new Map(
      stationList.map((station) => [station.stationId, ensureStationRuntimeState(station)]),
    );
    const currentStation = stations.get(train.location.stationId);
    if (!currentStation) {
      throw new Error('The train current station was not found.');
    }

    if (hydrateLegacyActiveRoutePaths(currentStation, session)) {
      applyRuntimeState(currentStation);
      applySessionTrainOccupations(currentStation, session);
      bumpRevision(currentStation);
      await saveStation(currentStation);
    }

    let routeResult = findNextLocalRoute(currentStation, train);
    let privolavaciaMovement = routeResult ? null : findPrivolavaciaMovement(currentStation, train);
    let steps = routeResult?.steps ?? privolavaciaMovement?.steps ?? [];
    let lineblockTransit: MockTrain['lineblockTransit'] = null;
    const affectedStationIds = new Set<string>([currentStation.stationId]);

    if ((!routeResult && !privolavaciaMovement) || steps.length === 0) {
      const completedRoute = train.location.routeId
        ? currentStation.runtime.activeTrainRoutes[train.location.routeId]
        : null;
      if (
        !completedRoute ||
        completedRoute.routeType !== 'normal' ||
        completedRoute.routeClass !== 'platform-to-premain'
      ) {
        throw new Error('No active route continues from the train current position.');
      }

      const localPremainId = completedRoute.signalPieceIds.find((pieceId) => {
        const type = currentStation.layout.pieces[pieceId]?.type;
        return type === 'premainSignal' || type === 'premainSignalNoOcp';
      });
      const localPremainLink = localPremainId
        ? Object.values(currentStation.runtime.lineblockPremainLinks).find(
            (link) => link.premainSignalPieceId === localPremainId,
          )
        : null;
      if (!localPremainLink) {
        throw new Error('The departure route is not connected to a lineblock.');
      }
      const linked = getLinkedLineblock(currentStation, session, localPremainLink.lineblockPieceId);
      if (!linked) {
        throw new Error('The departure lineblock is not linked to another station.');
      }
      const receivingStation = stations.get(linked.remote.stationId);
      if (!receivingStation) {
        throw new Error('The receiving station was not found.');
      }
      const remotePremainLink = Object.values(receivingStation.runtime.lineblockPremainLinks).find(
        (link) => link.lineblockPieceId === linked.remote.pieceId,
      );
      const receivingRoute = remotePremainLink
        ? Object.values(receivingStation.runtime.activeTrainRoutes).find(
            (route) =>
              route.routeType === 'normal' &&
              route.routeClass === 'premain-to-platform' &&
              route.direction === train.direction &&
              route.sourcePieceId === remotePremainLink.premainSignalPieceId,
          )
        : null;
      if (!receivingRoute) {
        throw new Error('No matching entrance route is active in the receiving station.');
      }

      const localState = getLineblockVisualState(currentStation, localPremainLink.lineblockPieceId);
      const remoteState = getLineblockVisualState(receivingStation, linked.remote.pieceId);
      validateLineblockActionStates('lineblock:mark-departed', localState, remoteState);
      applyLineblockActionStates(
        'lineblock:mark-departed',
        currentStation,
        localPremainLink.lineblockPieceId,
        receivingStation,
        linked.remote.pieceId,
      );
      syncPremainAvailability(currentStation);
      syncPremainAvailability(receivingStation);
      affectedStationIds.add(receivingStation.stationId);

      const entrySignalPieceId = receivingRoute.signalPieceIds.find((pieceId) => {
        const type = receivingStation.layout.pieces[pieceId]?.type;
        return type === 'entrySignal' || type === 'entrySignalNoOcp';
      });
      if (!entrySignalPieceId) {
        throw new Error('The receiving route does not contain an entrance signal.');
      }
      const entrySignalIndex = receivingRoute.path.findIndex(
        (step) => step.pieceId === entrySignalPieceId,
      );
      if (entrySignalIndex < 0) {
        throw new Error('The receiving route path does not include its entrance signal.');
      }

      routeResult = {
        route: receivingRoute,
        steps: getRouteSteps(receivingStation, receivingRoute, train.length),
      };
      steps = routeResult.steps;
      lineblockTransit = {
        linkId: linked.link.id,
        fromStationId: currentStation.stationId,
        toStationId: receivingStation.stationId,
        receivingLineblockPieceId: linked.remote.pieceId,
        receivingRouteId: receivingRoute.id,
        entrySignalPieceId,
        protectedPieceIds: receivingRoute.path
          .slice(0, entrySignalIndex + 1)
          .map((step) => step.pieceId),
      };
      train.lineblockTransit = lineblockTransit;
    }

    if (!routeResult && !privolavaciaMovement) {
      privolavaciaMovement = findPrivolavaciaMovement(currentStation, train);
      steps = privolavaciaMovement?.steps ?? steps;
    }

    if ((!routeResult && !privolavaciaMovement) || steps.length === 0) {
      throw new Error('The selected route has no remaining movement steps.');
    }

    if (routeResult) {
      claimExistingTrainSensorsForRoute(train, routeResult.route, steps[0].stationId);
      assertRouteSignalPermitsMovement(routeResult.route, steps);
    }
    assertMovementSensorsAvailable(session, train.id, stations, steps);

    const movement = {
      id: randomUUID(),
      status: 'running' as const,
      steps,
      nextStepIndex: 0,
      dueAt: new Date(Date.now() + 2000).toISOString(),
      routeRefs: [
        {
          stationId: routeResult
            ? routeResult.route === currentStation.runtime.activeTrainRoutes[routeResult.route.id]
              ? currentStation.stationId
              : steps[0].stationId
            : currentStation.stationId,
          routeId: routeResult ? routeResult.route.id : `pn:${privolavaciaMovement?.signalPieceId ?? 'unknown'}`,
        },
      ],
      lineblockTransit,
    };
    train.status = 'moving';
    train.movement = movement;
    train.updatedAt = nowIso();
    session.updatedAt = nowIso();
    await saveSession(session);
    await saveTrainStationSnapshots(session, stations, affectedStationIds);
    scheduleTrainMovement(sessionId, train);
    return train;
  },

  async removeMockTrain(sessionId: string, trainId: string) {
    const rawSession = await sessionRepository.findById(sessionId);
    if (!rawSession) {
      throw new Error('Session not found.');
    }
    const session = ensureSessionRuntimeState(rawSession);
    const train = session.runtime.trains[trainId];
    if (!train) {
      throw new Error('Train not found.');
    }

    const affectedStationIds = new Set(train.occupiedSensors.map((sensor) => sensor.stationId));
    const timerKey = getTrainTimerKey(sessionId, trainId);
    const timer = trainMovementTimers.get(timerKey);
    if (timer) {
      clearTimeout(timer);
      trainMovementTimers.delete(timerKey);
    }
    if (train.lineblockTransit) {
      session.runtime.lineblocks[train.lineblockTransit.linkId] = {
        arrivalAcknowledgementEligible: true,
        trainId,
        updatedAt: nowIso(),
      };
    }
    delete session.runtime.trains[trainId];
    session.updatedAt = nowIso();
    await saveSession(session);

    const stationList = await stationRepository.listBySessionId(sessionId);
    const stations = new Map(
      stationList.map((station) => [station.stationId, ensureStationRuntimeState(station)]),
    );
    applyRouteProgressFromMockSensors(stations, train.occupiedSensors, false);
    await saveTrainStationSnapshots(session, stations, affectedStationIds);
    return { trainId };
  },

  async reverseMockTrain(sessionId: string, trainId: string) {
    const rawSession = await sessionRepository.findById(sessionId);
    if (!rawSession) {
      throw new Error('Session not found.');
    }
    const session = ensureSessionRuntimeState(rawSession);
    const train = session.runtime.trains[trainId];
    if (!train) {
      throw new Error('Train not found.');
    }
    if (train.status === 'moving' || train.movement) {
      throw new Error('A moving train cannot reverse direction.');
    }
    if (train.lineblockTransit) {
      throw new Error('A train in lineblock transit cannot reverse direction.');
    }
    if (train.occupiedSensors.length === 0) {
      throw new Error('Train has no occupied sensors to reverse from.');
    }

    const newDirection: TrainDirection =
      train.direction === 'left-to-right' ? 'right-to-left' : 'left-to-right';
    const reversedSensors = [...train.occupiedSensors].reverse();
    const newFront = reversedSensors[0];
    if (!newFront) {
      throw new Error('Train has no front sensor after reversal.');
    }

    train.direction = newDirection;
    train.occupiedSensors = reversedSensors;
    train.location = {
      stationId: newFront.stationId,
      pieceId: newFront.pieceId,
      routeId: null,
      routeStepIndex: null,
    };
    train.updatedAt = nowIso();
    session.updatedAt = nowIso();
    await saveSession(session);
    return train;
  },

  async createStation(
    sessionId: string,
    stationId: string,
    layoutOverride?: StationDocument['layout'],
  ) {
    return this.ensureStation(sessionId, stationId, layoutOverride);
  },

  async createLineblockLink(
    sessionId: string,
    endpoints: Pick<SessionLineblockLink, 'a' | 'b' | 'defaultFlow'>,
    suppressRuntimeNotify = false,
  ) {
    const rawSession = await sessionRepository.findById(sessionId);
    if (!rawSession) {
      throw new Error('Session not found.');
    }
    const session = ensureSessionRuntimeState(rawSession);

    if (
      endpoints.a.stationId === endpoints.b.stationId &&
      endpoints.a.pieceId === endpoints.b.pieceId
    ) {
      throw new Error('Lineblock link endpoints must be different.');
    }

    const stations = await stationRepository.listBySessionId(sessionId);
    const stationsById = new Map(stations.map((station) => [station.stationId, station]));
    const stationA = stationsById.get(endpoints.a.stationId);
    const stationB = stationsById.get(endpoints.b.stationId);

    if (!stationA || !stationB) {
      throw new Error('Both stations must exist in the session.');
    }

    ensureStationRuntimeState(stationA);
    ensureStationRuntimeState(stationB);

    const pieceA = stationA.layout.pieces[endpoints.a.pieceId];
    const pieceB = stationB.layout.pieces[endpoints.b.pieceId];

    if (!pieceA || pieceA.type !== 'lineblock') {
      throw new Error(
        `Station ${endpoints.a.stationId} does not contain lineblock ${endpoints.a.pieceId}.`,
      );
    }

    if (!pieceB || pieceB.type !== 'lineblock') {
      throw new Error(
        `Station ${endpoints.b.stationId} does not contain lineblock ${endpoints.b.pieceId}.`,
      );
    }

    const linkAlreadyExists = Object.values(session.topology.lineblockLinks).some((existingLink) =>
      [existingLink.a, existingLink.b].some(
        (endpoint) =>
          (endpoint.stationId === endpoints.a.stationId &&
            endpoint.pieceId === endpoints.a.pieceId) ||
          (endpoint.stationId === endpoints.b.stationId &&
            endpoint.pieceId === endpoints.b.pieceId),
      ),
    );

    if (linkAlreadyExists) {
      throw new Error('Each lineblock can only be linked to one other station lineblock.');
    }

    const linkId = randomUUID();
    const createdAt = nowIso();
    session.topology.lineblockLinks[linkId] = {
      id: linkId,
      sessionId,
      a: endpoints.a,
      b: endpoints.b,
      defaultFlow: normalizeLineblockDefaultFlow(endpoints.defaultFlow),
      createdAt,
    };
    session.runtime.lineblocks[linkId] = {
      arrivalAcknowledgementEligible: false,
      trainId: null,
      updatedAt: createdAt,
    };
    session.updatedAt = createdAt;

    applyLineblockDefaultFlowToStations(
      session.topology.lineblockLinks[linkId].defaultFlow,
      stationA,
      endpoints.a.pieceId,
      stationB,
      endpoints.b.pieceId,
    );
    syncPremainAvailability(stationA);
    syncPremainAvailability(stationB);
    applyRuntimeState(stationA);
    applyRuntimeState(stationB);

    await saveSession(session, { skipRuntimeNotify: suppressRuntimeNotify });
    bumpRevision(stationA);
    bumpRevision(stationB);
    await saveStation(stationA, { skipRuntimeNotify: suppressRuntimeNotify });
    await saveStation(stationB, { skipRuntimeNotify: suppressRuntimeNotify });
    return session.topology.lineblockLinks[linkId];
  },

  async updateLineblockLinkDefaultFlow(
    sessionId: string,
    linkId: string,
    defaultFlow: SessionLineblockLink['defaultFlow'],
  ) {
    const rawSession = await sessionRepository.findById(sessionId);
    if (!rawSession) throw new Error('Session not found.');
    const session = ensureSessionRuntimeState(rawSession);
    const link = session.topology.lineblockLinks[linkId];
    if (!link) throw new Error('Lineblock link was not found.');
    if (session.runtime.lineblocks[linkId]?.trainId) {
      throw new Error('Cannot change a lineblock default while a train is using it.');
    }

    const stations = await stationRepository.listBySessionId(sessionId);
    const stationA = stations.find((station) => station.stationId === link.a.stationId);
    const stationB = stations.find((station) => station.stationId === link.b.stationId);
    if (!stationA || !stationB) throw new Error('Both stations for this lineblock link must exist.');

    ensureStationRuntimeState(stationA);
    ensureStationRuntimeState(stationB);
    link.defaultFlow = normalizeLineblockDefaultFlow(defaultFlow);
    session.updatedAt = nowIso();
    applyLineblockDefaultFlowToStations(link.defaultFlow, stationA, link.a.pieceId, stationB, link.b.pieceId);
    syncPremainAvailability(stationA);
    syncPremainAvailability(stationB);
    applyRuntimeState(stationA);
    applyRuntimeState(stationB);
    bumpRevision(stationA);
    bumpRevision(stationB);
    await saveSession(session);
    await saveStation(stationA);
    await saveStation(stationB);
    return link;
  },

  async removeLineblockLink(sessionId: string, linkId: string) {
    const rawSession = await sessionRepository.findById(sessionId);
    if (!rawSession) throw new Error('Session not found.');
    const session = ensureSessionRuntimeState(rawSession);
    const link = session.topology.lineblockLinks[linkId];
    if (!link) throw new Error('Lineblock link was not found.');
    if (session.runtime.lineblocks[linkId]?.trainId) {
      throw new Error('Cannot remove a lineblock link while a train is using it.');
    }

    const stations = await stationRepository.listBySessionId(sessionId);
    const stationA = stations.find((station) => station.stationId === link.a.stationId);
    const stationB = stations.find((station) => station.stationId === link.b.stationId);
    if (stationA) {
      setLineblockVisualState(stationA, link.a.pieceId, 'default');
      syncPremainAvailability(stationA);
      applyRuntimeState(stationA);
      bumpRevision(stationA);
      await saveStation(stationA);
    }
    if (stationB) {
      setLineblockVisualState(stationB, link.b.pieceId, 'default');
      syncPremainAvailability(stationB);
      applyRuntimeState(stationB);
      bumpRevision(stationB);
      await saveStation(stationB);
    }

    delete session.topology.lineblockLinks[linkId];
    delete session.runtime.lineblocks[linkId];
    session.updatedAt = nowIso();
    await saveSession(session);
  },

  async renameStation(sessionId: string, stationId: string, nextStationId: string) {
    if (stationId === nextStationId) return this.getStation(sessionId, stationId);
    const rawSession = await sessionRepository.findById(sessionId);
    if (!rawSession) throw new Error('Session not found.');
    const session = ensureSessionRuntimeState(rawSession);
    if (Object.keys(session.runtime.trains).length > 0) {
      throw new Error('Stations can only be renamed when the session has no trains.');
    }
    const station = await stationRepository.findBySessionAndStationId(sessionId, stationId);
    if (!station) throw new Error('Station not found.');
    if (await stationRepository.findBySessionAndStationId(sessionId, nextStationId)) {
      throw new Error(`Station ${nextStationId} already exists.`);
    }

    station.stationId = nextStationId;
    Object.values(session.topology.lineblockLinks).forEach((link) => {
      if (link.a.stationId === stationId) link.a.stationId = nextStationId;
      if (link.b.stationId === stationId) link.b.stationId = nextStationId;
    });
    Object.values(session.runtime.physicalOccupations).forEach((occupation) => {
      if (occupation.stationId === stationId) occupation.stationId = nextStationId;
    });
    session.updatedAt = nowIso();
    await saveSession(session);
    await saveStation(station);
    return station;
  },

  async removeStation(sessionId: string, stationId: string) {
    const rawSession = await sessionRepository.findById(sessionId);
    if (!rawSession) throw new Error('Session not found.');
    const session = ensureSessionRuntimeState(rawSession);
    if (Object.keys(session.runtime.trains).length > 0) {
      throw new Error('Stations can only be removed when the session has no trains.');
    }
    if (Object.values(session.runtime.physicalOccupations).some(
      (occupation) => occupation.stationId === stationId && occupation.occupied,
    )) {
      throw new Error('Stations can only be removed when they have no physical occupations.');
    }
    const station = await stationRepository.findBySessionAndStationId(sessionId, stationId);
    if (!station) throw new Error('Station not found.');

    const stations = await stationRepository.listBySessionId(sessionId);
    const links = Object.values(session.topology.lineblockLinks)
      .filter((link) => link.a.stationId === stationId || link.b.stationId === stationId)
    links.forEach((link) => {
      const remoteEndpoint = link.a.stationId === stationId ? link.b : link.a;
      const remoteStation = stations.find((candidate) => candidate.stationId === remoteEndpoint.stationId);
      if (remoteStation) {
        setLineblockVisualState(remoteStation, remoteEndpoint.pieceId, 'default');
        syncPremainAvailability(remoteStation);
        applyRuntimeState(remoteStation);
        bumpRevision(remoteStation);
      }
      delete session.topology.lineblockLinks[link.id];
      delete session.runtime.lineblocks[link.id];
    });
    Object.entries(session.runtime.physicalOccupations).forEach(([key, occupation]) => {
      if (occupation.stationId === stationId) delete session.runtime.physicalOccupations[key];
    });
    session.updatedAt = nowIso();
    await saveSession(session);
    await Promise.all(
      stations
        .filter((candidate) => candidate.stationId !== stationId)
        .filter((candidate) => links.some((link) => link.a.stationId === candidate.stationId || link.b.stationId === candidate.stationId))
        .map((candidate) => saveStation(candidate)),
    );
    await stationRepository.removeBySessionAndStationId(sessionId, stationId);
  },

  async submitLineblockAction(command: LineblockActionCommand) {
    const localStation = await stationRepository.findBySessionAndStationId(
      command.sessionId,
      command.stationId,
    );
    if (!localStation) {
      throw new Error('Station not found.');
    }

    ensureStationRuntimeState(localStation);

    const localPiece = localStation.layout.pieces[command.payload.pieceId];
    if (!localPiece || !isLineblockPieceType(localPiece.type)) {
      throw new Error(`Lineblock piece "${command.payload.pieceId}" was not found.`);
    }

    const rawSession = await sessionRepository.findById(command.sessionId);
    if (!rawSession) {
      throw new Error('Session not found.');
    }
    const session = ensureSessionRuntimeState(rawSession);

    const linked = getLinkedLineblock(localStation, session, command.payload.pieceId);
    if (!linked) {
      throw new Error('This lineblock is not linked to another station lineblock.');
    }

    const remoteStation = await stationRepository.findBySessionAndStationId(
      command.sessionId,
      linked.remote.stationId,
    );
    if (!remoteStation) {
      throw new Error('Linked remote station was not found.');
    }

    ensureStationRuntimeState(remoteStation);

    const remotePiece = remoteStation.layout.pieces[linked.remote.pieceId];
    if (!remotePiece || !isLineblockPieceType(remotePiece.type)) {
      throw new Error('Linked remote lineblock was not found.');
    }

    const localState = getLineblockVisualState(localStation, command.payload.pieceId);
    const remoteState = getLineblockVisualState(remoteStation, linked.remote.pieceId);
    validateLineblockActionStates(command.type, localState, remoteState);
    if (
      command.type === 'lineblock:mark-arrived' &&
      !session.runtime.lineblocks[linked.link.id]?.arrivalAcknowledgementEligible
    ) {
      throw new Error(
        'Odhlaska is only allowed after the complete train has passed the entrance signal.',
      );
    }

    applyLineblockActionStates(
      command.type,
      localStation,
      command.payload.pieceId,
      remoteStation,
      linked.remote.pieceId,
    );

    syncPremainAvailability(localStation);
    syncPremainAvailability(remoteStation);
    applyRuntimeState(localStation);
    applyRuntimeState(remoteStation);
    applySessionTrainOccupations(localStation, session);
    applySessionTrainOccupations(remoteStation, session);
    if (command.type === 'lineblock:mark-arrived') {
      const trainId = session.runtime.lineblocks[linked.link.id]?.trainId;
      if (trainId && session.runtime.trains[trainId]) {
        session.runtime.trains[trainId].lineblockTransit = null;
        session.runtime.trains[trainId].updatedAt = nowIso();
      }
      session.runtime.lineblocks[linked.link.id] = {
        arrivalAcknowledgementEligible: false,
        trainId: null,
        updatedAt: nowIso(),
      };
      session.updatedAt = nowIso();
      await saveSession(session);
    }
    bumpRevision(localStation);
    bumpRevision(remoteStation);
    await saveStation(localStation);
    await saveStation(remoteStation);

    return {
      localStation,
      remoteStation,
    };
  },

  async submitSwitchSetPosition(command: SwitchSetPositionCommand) {
    const [station, rawSession] = await Promise.all([
      stationRepository.findBySessionAndStationId(command.sessionId, command.stationId),
      sessionRepository.findById(command.sessionId),
    ]);
    if (!station || !rawSession) {
      throw new Error('Station not found.');
    }
    const session = ensureSessionRuntimeState(rawSession);
    ensureStationRuntimeState(station);

    const button = station.layout.pieces[command.payload.pieceId];
    const control = getConnectedSwitchControl(station.layout, command.payload.pieceId);
    if (!button || button.type !== 'switchButton' || !control) {
      throw new Error('The selected switch button is not connected to a switch.');
    }

    const currentState = button.state.groups.switch?.state ?? 'default';
    const neutral = currentState === 'default' || currentState === 'middleSet';
    const releasing = command.payload.position === 'middleSet';
    if (releasing) {
      if (currentState !== 'leftSet' && currentState !== 'rightSet') {
        throw new Error('Only a fixed switch button can be returned to neutral.');
      }
    } else if (!neutral) {
      throw new Error('Return the switch button to neutral before setting the other position.');
    }

    assertSwitchControlAvailable(station, session, control);

    const action = createPendingAction(command);

    if (releasing) {
      button.state.groups.switch = {
        state: 'default',
        variant: 'normal',
      };
      action.status = 'completed';
      action.startedAt = nowIso();
      action.dueAt = null;
      action.finishedAt = nowIso();
      action.result = {
        pieceId: command.payload.pieceId,
        switchPieceId: control.switchPieceId,
        controlSlot: control.slot,
        position: 'middleSet',
        retainedTraversableState:
          station.runtime.switchAlignments[control.switchPieceId]?.traversableState ?? null,
      };
      applyRuntimeState(station);
      applySessionTrainOccupations(station, session);
      bumpRevision(station);
      printDebugBlock(
        'web-debug',
        `${station.sessionId}/${station.stationId} accepted ${action.type}`,
        buildActionDebugLines(station, action),
      );
      await stationActionLogRepository.create(toActionLog(station, action));
      await saveStation(station);
      return action;
    }

    const switchPiece = station.layout.pieces[control.switchPieceId];
    const currentAlignment = station.runtime.switchAlignments[control.switchPieceId];
    const requestedMotorPosition: SwitchMotorPosition =
      command.payload.position === 'leftSet' ? 'left' : 'right';
    const currentMotorPosition =
      currentAlignment?.motorPositions[control.slot] ??
      (switchPiece ? getDefaultSwitchMotorPositions(switchPiece.type)[control.slot] : undefined);

    if (switchPiece && currentMotorPosition === requestedMotorPosition) {
      button.state.groups.switch = {
        state: command.payload.position,
        variant: 'normal',
      };
      const traversableState =
        currentAlignment?.traversableState ??
        getTraversableStateForMotorPositions(
          switchPiece.type,
          currentAlignment?.motorPositions ?? getDefaultSwitchMotorPositions(switchPiece.type),
        ) ??
        'disconnected';

      action.status = 'completed';
      action.startedAt = nowIso();
      action.dueAt = null;
      action.finishedAt = nowIso();
      action.result = {
        pieceId: command.payload.pieceId,
        switchPieceId: control.switchPieceId,
        controlSlot: control.slot,
        position: command.payload.position,
        traversableState,
      };
      applyRuntimeState(station);
      applySessionTrainOccupations(station, session);
      bumpRevision(station);
      printDebugBlock(
        'web-debug',
        `${station.sessionId}/${station.stationId} accepted ${action.type}`,
        buildActionDebugLines(station, action),
      );
      await stationActionLogRepository.create(toActionLog(station, action));
      await saveStation(station);
      return action;
    }

    action.status = 'running';
    action.startedAt = nowIso();
    station.runtime.pendingActions[action.id] = action;
    applyRuntimeState(station);
    applySessionTrainOccupations(station, session);
    bumpRevision(station);
    printDebugBlock(
      'web-debug',
      `${station.sessionId}/${station.stationId} accepted ${action.type}`,
      buildActionDebugLines(station, action),
    );
    await saveStation(station);

    scheduleSwitchAction(station, action);

    return action;
  },

  async submitRouteInteract(command: RouteInteractCommand) {
    const [station, rawSession] = await Promise.all([
      stationRepository.findBySessionAndStationId(command.sessionId, command.stationId),
      sessionRepository.findById(command.sessionId),
    ]);
    if (!station || !rawSession) {
      throw new Error('Station not found.');
    }

    const session = ensureSessionRuntimeState(rawSession);
    ensureStationRuntimeState(station);
    applySessionTrainOccupations(station, session);

    const piece = station.layout.pieces[command.payload.pieceId];
    if (!piece) {
      throw new Error('Selected route endpoint was not found.');
    }

    const mode = command.payload.button === 'right' ? 'cancel' : 'build';
    const selectedRoute = station.runtime.routeSelection;
    const routeType = selectedRoute?.routeType ?? command.payload.control;
    const shuntEndpointTypes = new Set([
      'departureButton',
      'shuntButton',
      'shuntButtonNoOcp',
      'shuntSignalButtonBuffer',
    ]);
    const canStartNormalRoute =
      piece.type === 'premainSignal' ||
      piece.type === 'premainSignalNoOcp' ||
      piece.type === 'departureButton';
    const canStartShuntRoute = shuntEndpointTypes.has(piece.type);

    if (
      !station.runtime.routeSelection &&
      ((routeType === 'normal' && !canStartNormalRoute) ||
        (routeType === 'shunt' && !canStartShuntRoute))
    ) {
      throw new Error(
        routeType === 'normal'
          ? 'Start a normal route from a premain signal or platform departure control.'
          : 'Start a shunting route from a shunt control.',
      );
    }

    const sourcePieceType = piece.type as RuntimeRouteSelection['sourcePieceType'];

    if (!station.runtime.routeSelection && mode === 'cancel') {
      const activeRoute = getActiveRouteFromSource(station, command.payload.pieceId, routeType);
      if (!activeRoute) {
        throw new Error('No active route starts from the selected endpoint.');
      }
      const occupiedPieceIds = getOccupiedPieceIdsForStation(session, station.stationId);
      const cancelDelay = getRouteCancelDelay(station, activeRoute, occupiedPieceIds);

      const action: PendingAction = {
        id: command.commandId,
        type: routeType === 'shunt' ? 'route:cancel-shunt' : 'route:cancel-normal',
        status: 'queued',
        sessionId: command.sessionId,
        stationId: command.stationId,
        issuedAt: command.issuedAt,
        startedAt: null,
        dueAt: new Date(Date.now() + cancelDelay.durationMs).toISOString(),
        finishedAt: null,
        payload: {
          routeType,
          routeId: activeRoute.id,
          sourcePieceId: activeRoute.sourcePieceId,
          targetPieceId: activeRoute.targetPieceId,
          sourceControl: activeRoute.sourceControl,
          targetControl: activeRoute.targetControl,
          routeClass: activeRoute.routeClass,
          cancelDelayLabel: cancelDelay.label,
        },
      };

      station.runtime.pendingActions[action.id] = action;
      applyRuntimeStateWithTrainOccupations(station, session);
      bumpRevision(station);
      printDebugBlock(
        'web-debug',
        `${station.sessionId}/${station.stationId} accepted ${action.type}`,
        buildActionDebugLines(station, action),
      );
      await saveStation(station);

      setTimeout(() => {
        void completeRouteAction(action.id, command.sessionId, command.stationId);
      }, cancelDelay.durationMs);

      return { kind: 'cancel-queued' as const, action };
    }

    if (!station.runtime.routeSelection) {
      station.runtime.routeSelection = {
        mode,
        routeType,
        sourcePieceId: command.payload.pieceId,
        sourcePieceType,
        sourceControl: command.payload.control,
        selectedAt: command.issuedAt,
      };
      applyRuntimeStateWithTrainOccupations(station, session);
      bumpRevision(station);
      await saveStation(station);
      return { kind: 'selection-started' as const };
    }

    const selection = station.runtime.routeSelection;
    if (selection.mode !== mode || selection.routeType !== routeType) {
      throw new Error('Finish the current route selection before starting a different action.');
    }

    if (selection.sourcePieceId === command.payload.pieceId) {
      station.runtime.routeSelection = null;
      applyRuntimeStateWithTrainOccupations(station, session);
      bumpRevision(station);
      await saveStation(station);
      return { kind: 'selection-cleared' as const };
    }

    const targetPieceType = piece.type as string;
    const validPair =
      selection.routeType === 'shunt'
        ? shuntEndpointTypes.has(targetPieceType)
        : ((selection.sourcePieceType === 'premainSignal' ||
            selection.sourcePieceType === 'premainSignalNoOcp') &&
            targetPieceType === 'departureButton') ||
          (selection.sourcePieceType === 'departureButton' &&
            (targetPieceType === 'shuntButton' || targetPieceType === 'shuntButtonNoOcp'));
    if (!validPair) {
      throw new Error(
        selection.routeType === 'shunt'
          ? 'Shunting routes must end at a shunt-capable route control.'
          : 'Normal routes must run from a premain signal to a platform departure control, or from a platform departure control to a shunt button.',
      );
    }

    if (mode === 'build') {
      const builtRoute = buildRouteFromSelection(
        station,
        selection.sourcePieceId,
        command.payload.pieceId,
        tiles,
        selection.routeType,
      );
      logRouteBuildDebug(station, builtRoute);
      const action: PendingAction = {
        id: command.commandId,
        type: selection.routeType === 'shunt' ? 'route:build-shunt' : 'route:build-normal',
        status: 'queued',
        sessionId: command.sessionId,
        stationId: command.stationId,
        issuedAt: command.issuedAt,
        startedAt: null,
        dueAt: new Date(Date.now() + ROUTE_BUILD_DELAY_MS).toISOString(),
        finishedAt: null,
        payload: {
          routeType: selection.routeType,
          sourcePieceId: selection.sourcePieceId,
          targetPieceId: command.payload.pieceId,
          sourceControl: selection.sourceControl,
          targetControl: command.payload.control,
          routeClass: builtRoute.routeClass,
          direction: builtRoute.direction,
          reservedOccupations: builtRoute.reservedOccupations,
          signalPieceIds: builtRoute.signalPieceIds,
          targetPlatformDepartureSignalPieceId: builtRoute.targetPlatformDepartureSignalPieceId,
          path: builtRoute.path,
        },
      };

      station.runtime.routeSelection = null;
      station.runtime.pendingActions[action.id] = action;
      const linkedLineblockStation = await setOutboundRouteLineblockStates(
        session,
        station,
        selection.sourcePieceId,
        builtRoute.signalPieceIds,
        builtRoute.routeClass,
        {
          local: 'sending',
          remote: 'receiving',
        },
      );
      applyRuntimeStateWithTrainOccupations(station, session);
      bumpRevision(station);
      printDebugBlock(
        'web-debug',
        `${station.sessionId}/${station.stationId} accepted ${action.type}`,
        buildActionDebugLines(station, action),
      );
      await saveStation(station);
      if (linkedLineblockStation) {
        applyRuntimeState(linkedLineblockStation);
        applySessionTrainOccupations(linkedLineblockStation, session);
        bumpRevision(linkedLineblockStation);
        await saveStation(linkedLineblockStation);
      }

      setTimeout(() => {
        void completeRouteAction(action.id, command.sessionId, command.stationId);
      }, ROUTE_BUILD_DELAY_MS);

      return { kind: 'build-queued' as const, action };
    }

    const activeRoute = Object.values(station.runtime.activeTrainRoutes).find(
      (route) =>
        route.routeType === selection.routeType &&
        route.sourcePieceId === selection.sourcePieceId &&
        route.targetPieceId === command.payload.pieceId,
    );
    if (!activeRoute) {
      throw new Error('No active route exists for the selected endpoints.');
    }
    const occupiedPieceIds = getOccupiedPieceIdsForStation(session, station.stationId);
    const cancelDelay = getRouteCancelDelay(station, activeRoute, occupiedPieceIds);

    const action: PendingAction = {
      id: command.commandId,
      type: selection.routeType === 'shunt' ? 'route:cancel-shunt' : 'route:cancel-normal',
      status: 'queued',
      sessionId: command.sessionId,
      stationId: command.stationId,
      issuedAt: command.issuedAt,
      startedAt: null,
      dueAt: new Date(Date.now() + cancelDelay.durationMs).toISOString(),
      finishedAt: null,
      payload: {
        routeType: selection.routeType,
        routeId: activeRoute.id,
        sourcePieceId: selection.sourcePieceId,
        targetPieceId: command.payload.pieceId,
        sourceControl: activeRoute.sourceControl ?? selection.sourceControl,
        targetControl: activeRoute.targetControl ?? command.payload.control,
        routeClass: activeRoute.routeClass,
        cancelDelayLabel: cancelDelay.label,
      },
    };

    station.runtime.routeSelection = null;
    station.runtime.pendingActions[action.id] = action;
    applyRuntimeStateWithTrainOccupations(station, session);
    bumpRevision(station);
    printDebugBlock(
      'web-debug',
      `${station.sessionId}/${station.stationId} accepted ${action.type}`,
      buildActionDebugLines(station, action),
    );
    await saveStation(station);

    setTimeout(() => {
      void completeRouteAction(action.id, command.sessionId, command.stationId);
    }, cancelDelay.durationMs);

    return { kind: 'cancel-queued' as const, action };
  },

  async submitPrivolavaciaInteract(command: PrivolavaciaInteractCommand) {
    const [station, rawSession] = await Promise.all([
      stationRepository.findBySessionAndStationId(command.sessionId, command.stationId),
      sessionRepository.findById(command.sessionId),
    ]);
    if (!station || !rawSession) {
      throw new Error('Station not found.');
    }

    const session = ensureSessionRuntimeState(rawSession);
    ensureStationRuntimeState(station);
    applySessionTrainOccupations(station, session);

    const piece = station.layout.pieces[command.payload.pieceId];
    if (!piece) {
      throw new Error('Selected PN control was not found.');
    }

    const controlledSignalPieceId = getPrivolavaciaSignalPieceIdForControl(
      station,
      command.payload.pieceId,
    );

    if (command.payload.button === 'right') {
      if (!controlledSignalPieceId) {
        throw new Error('PN can only be cancelled from the matching route control.');
      }
      if (!station.runtime.activePrivolavaciaSignals[controlledSignalPieceId]) {
        throw new Error('The selected control does not currently have PN active.');
      }

      cancelPrivolavaciaSignal(station, controlledSignalPieceId);
      station.runtime.privolavaciaSelection = null;
      applyRuntimeStateWithTrainOccupations(station, session);
      bumpRevision(station);
      await saveStation(station);
      return { kind: 'cancelled' as const };
    }

    if (isPrivolavaciaCounterPieceType(piece.type)) {
      const linkedSignalIds = getPrivolavaciaLinkedSignals(station, command.payload.pieceId);
      if (linkedSignalIds.length === 0) {
        throw new Error('The selected PN counter is not linked to any entry or departure signal.');
      }

      if (linkedSignalIds.length === 1) {
        activatePrivolavaciaSignal(
          station,
          command.payload.pieceId,
          linkedSignalIds[0],
          command.issuedAt,
        );
        station.runtime.privolavaciaSelection = null;
        applyRuntimeStateWithTrainOccupations(station, session);
        bumpRevision(station);
        await saveStation(station);
        return { kind: 'activated' as const, signalPieceId: linkedSignalIds[0] };
      }

      station.runtime.privolavaciaSelection = {
        sealedCounterPieceId: command.payload.pieceId,
        selectedAt: command.issuedAt,
      };
      applyRuntimeStateWithTrainOccupations(station, session);
      bumpRevision(station);
      await saveStation(station);
      return { kind: 'selection-started' as const };
    }

    const selection = station.runtime.privolavaciaSelection;
    if (!selection) {
      throw new Error('Select a grouped PN counter first, then use the matching route control.');
    }

    if (command.payload.button !== 'left') {
      throw new Error('Grouped PN activation uses the left-click route control.');
    }

    if (!controlledSignalPieceId) {
      throw new Error('PN can only be activated from the matching route control.');
    }

    activatePrivolavaciaSignal(
      station,
      selection.sealedCounterPieceId,
      controlledSignalPieceId,
      command.issuedAt,
    );
    station.runtime.privolavaciaSelection = null;
    applyRuntimeStateWithTrainOccupations(station, session);
    bumpRevision(station);
    await saveStation(station);
    return { kind: 'activated' as const, signalPieceId: controlledSignalPieceId };
  },

  async applyMockInboundSwitchPosition(command: SwitchSetPositionCommand) {
    const [station, rawSession] = await Promise.all([
      stationRepository.findBySessionAndStationId(command.sessionId, command.stationId),
      sessionRepository.findById(command.sessionId),
    ]);
    if (!station || !rawSession) {
      throw new Error('Station not found.');
    }
    const session = ensureSessionRuntimeState(rawSession);
    ensureStationRuntimeState(station);

    const layout = deserializeStationLayout(station.layout);
    const button = layout.pieces[command.payload.pieceId];
    const control = getConnectedSwitchControl(layout, command.payload.pieceId);
    const switchPiece = control ? layout.pieces[control.switchPieceId] : null;

    if (!button || button.type !== 'switchButton' || !control || !switchPiece) {
      throw new Error('Switch button is not connected to a switch.');
    }

    button.state.groups.switch = {
      state: command.payload.position === 'middleSet' ? 'default' : command.payload.position,
      variant: 'normal',
    };

    if (command.payload.position !== 'middleSet') {
      const currentAlignment = station.runtime.switchAlignments[control.switchPieceId];
      const motorPositions = {
        ...getDefaultSwitchMotorPositions(switchPiece.type),
        ...(currentAlignment?.motorPositions ?? {}),
        [control.slot]: command.payload.position === 'leftSet' ? 'left' : 'right',
      } as const;
      station.runtime.switchAlignments[control.switchPieceId] = {
        traversableState:
          getTraversableStateForMotorPositions(switchPiece.type, motorPositions) ?? 'disconnected',
        motorPositions,
        updatedAt: nowIso(),
      };
    }

    station.layout = serializeStationLayout(layout);
    applyRuntimeState(station);
    applySessionTrainOccupations(station, session);
    bumpRevision(station);
    await saveStation(station);
    return station;
  },
};
