import { randomUUID } from 'crypto';

import { stateGroups, tiles } from '@/app/data/tiles';
import type {
  ActiveTrainRoute,
  LineblockActionCommand,
  LineblockActionType,
  MockTrain,
  PendingAction,
  RouteInteractCommand,
  RuntimeRouteSelection,
  SessionDocument,
  SessionLineblockLink,
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
  getLineblockPremainLinksFromLayout,
  getPieceAnchor,
  isLineblockPieceType,
  parseCellRef,
  placePieceAt,
} from '@/lib/station/layout';
import {
  applyActiveRouteVisualState,
  applyTrainOccupationVisualState,
  buildRouteFromSelection,
  crossoverTraversalStatesConflict,
} from '@/lib/station/routes';
import {
  getConnectedSwitchControl,
  getDefaultSwitchMotorPositions,
  getMotorPositionsForTraversableState,
  getRequiredSwitchMotorPositions,
  getTraversableStateForMotorPositions,
  isCrossoverSwitchType,
  isPhysicalSwitchType,
  isSwitchTraversalAllowedByButtonLocks,
  type SwitchControlSlot,
  type SwitchMotorPosition,
} from '@/lib/station/switches';
import { resolveComponentStyles } from '@/lib/station/tile-state';

import { sessionRepository } from '../repositories/session-repository';
import { stationActionLogRepository } from '../repositories/station-action-log-repository';
import { stationRepository } from '../repositories/station-repository';
import { mockRobloxControlPort } from '../roblox/mock-roblox-port';
import { publishStationSnapshot } from '../station-events';

function nowIso() {
  return new Date().toISOString();
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

async function saveAndPublish(station: StationDocument) {
  await stationRepository.save(station);
  publishStationSnapshot(station);
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
    routeSelection: existingRuntime.routeSelection ?? null,
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

function syncPremainAvailability(station: StationDocument) {
  if (!station.runtime) {
    station.runtime = {
      pendingActions: {},
      lineblockPremainLinks: getLineblockPremainLinksFromLayout(station.layout),
      premainSignalStates: {},
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
      state: selection.routeType === 'shunt' ? 'shunt' : 'departure',
      variant: 'normal',
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
      piece.state.groups.button = {
        state: action.payload.routeType === 'shunt' ? 'shunt' : 'departure',
        variant: 'blinking',
      };
    }
  });
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
}

function ensureSessionRuntimeState(session: SessionDocument) {
  session.runtime ??= {
    trains: {},
    lineblocks: {},
  };
  session.runtime.trains ??= {};
  session.runtime.lineblocks ??= {};

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

function applySessionTrainOccupations(station: StationDocument, session: SessionDocument) {
  const occupiedSensors = Object.values(session.runtime.trains).flatMap((train) =>
    train.occupiedSensors
      .filter((sensor) => sensor.stationId === station.stationId)
      .map((sensor) => ({
        pieceId: sensor.pieceId,
        occupationState: sensor.occupationState,
      })),
  );
  applyTrainOccupationVisualState(station, occupiedSensors);
  Object.values(station.runtime.pendingActions).forEach((action) => {
    if (action.type === 'switch:set-position') {
      applyPendingSwitchVisualState(station, action);
    }
  });
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

function getRouteSteps(station: StationDocument, route: ActiveTrainRoute): TrainMovementStep[] {
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
  if (
    lastStep &&
    (lastPieceType === 'departureButton' ||
      lastPieceType === 'shuntButton' ||
      lastPieceType === 'shuntButtonNoOcp' ||
      lastPieceType === 'shuntSignalButtonBuffer')
  ) {
    steps.pop();
  }

  return steps;
}

function findNextLocalRoute(station: StationDocument, train: MockTrain) {
  const routes = Object.values(station.runtime.activeTrainRoutes).filter(
    (route) => route.direction === train.direction && route.path.length > 0,
  );

  if (train.location.routeId) {
    const currentRoute = station.runtime.activeTrainRoutes[train.location.routeId];
    if (currentRoute && train.location.routeStepIndex !== null) {
      const remainingSteps = getRouteSteps(station, currentRoute).slice(
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

    const remainingSteps = getRouteSteps(station, route).filter(
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
    ? { route: candidate.route, steps: getRouteSteps(station, candidate.route) }
    : null;
}

function mergeCrossoverAlignment(current: string | undefined, incoming: string) {
  if (!current || current === incoming) {
    return incoming;
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
    if (localState !== 'receiving' || remoteState !== 'sending') {
      throw new Error('Arrival acknowledgement can only be marked from receiving/sending.');
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
    const step = route.path.find((candidate) => candidate.pieceId === control.switchPieceId);
    if (!step) {
      return false;
    }

    const hasOccupationSensor = Boolean(switchPiece.state.groups.occupation);
    const remainsReserved = route.reservedOccupations.some(
      (occupation) => occupation.pieceId === control.switchPieceId,
    );
    return (
      (!hasOccupationSensor || remainsReserved) &&
      traversalUsesSwitchControl(switchPiece.type, step.traversalState, control.slot)
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

  if (activeRouteBlocks || pendingRouteBlocks || trainBlocks || switchActionBlocks) {
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

    await mockRobloxControlPort.setSwitchPosition({
      sessionId,
      stationId,
      pieceId: control.switchPieceId,
      controlSlot: control.slot,
      position,
    });

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
  await stationActionLogRepository.create(toActionLog(station, finalAction));
  await saveAndPublish(station);
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
  await saveAndPublish(station);

  try {
    if (action.type === 'route:build-normal' || action.type === 'route:build-shunt') {
      const route: ActiveTrainRoute = {
        id: action.id,
        routeType: action.payload.routeType as ActiveTrainRoute['routeType'],
        routeClass: action.payload.routeClass as ActiveTrainRoute['routeClass'],
        direction: action.payload.direction as ActiveTrainRoute['direction'],
        sourcePieceId: action.payload.sourcePieceId as string,
        targetPieceId: action.payload.targetPieceId as string,
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
      action.result = { routeId };
      action.status = 'completed';
      action.finishedAt = nowIso();
    }
  } catch (error) {
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
  await stationActionLogRepository.create(toActionLog(station, finalAction));
  await saveAndPublish(station);
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
    await saveAndPublish(station);
  }
}

function markPassedSignal(station: StationDocument, routeId: string, signalPieceId: string) {
  const route = station.runtime.activeTrainRoutes[routeId];
  if (route && !route.passedSignalPieceIds.includes(signalPieceId)) {
    route.passedSignalPieceIds.push(signalPieceId);
  }
}

function releaseSensorReservations(
  stations: Map<string, StationDocument>,
  sensors: MockTrain['occupiedSensors'],
) {
  sensors.forEach((sensor) => {
    if (!sensor.routeId) {
      return;
    }

    const route = stations.get(sensor.stationId)?.runtime.activeTrainRoutes[sensor.routeId];
    if (!route) {
      return;
    }

    route.reservedOccupations = route.reservedOccupations.filter(
      (occupation) => occupation.pieceId !== sensor.pieceId,
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
  const route = receivingStation?.runtime.activeTrainRoutes[transit.receivingRouteId];
  const entryIndex = route?.path.findIndex((step) => step.pieceId === transit.entrySignalPieceId);
  if (!route || entryIndex === undefined || entryIndex < 0) {
    return;
  }

  const completelyPastEntry = train.occupiedSensors.every((sensor) => {
    if (sensor.stationId !== transit.toStationId) {
      return false;
    }
    const index = route.path.findIndex((step) => step.pieceId === sensor.pieceId);
    return index > entryIndex;
  });

  if (completelyPastEntry) {
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
    await sessionRepository.save(session);
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
  releaseSensorReservations(stations, clearedSensors);

  train.location = {
    stationId: step.stationId,
    pieceId: step.pieceId,
    routeId: step.routeId,
    routeStepIndex: step.routeStepIndex,
  };
  if (previousStep?.signalPieceId) {
    const signalStation = stations.get(previousStep.stationId);
    if (signalStation) {
      markPassedSignal(signalStation, previousStep.routeId, previousStep.signalPieceId);
      affectedStationIds.add(previousStep.stationId);
    }
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
  await sessionRepository.save(session);
  await saveTrainStationSnapshots(session, stations, affectedStationIds);

  if (train.movement) {
    scheduleTrainMovement(sessionId, train);
  }
}

export const stationService = {
  async createMockSession() {
    const createdAt = nowIso();
    const session: SessionDocument = {
      _id: `mock-${randomUUID().slice(0, 8)}`,
      createdAt,
      updatedAt: createdAt,
      status: 'active',
      mockMode: true,
      topology: {
        lineblockLinks: {},
      },
      runtime: {
        trains: {},
        lineblocks: {},
      },
    };

    await sessionRepository.create(session);
    return session;
  },

  async ensureStation(
    sessionId: string,
    stationId: string,
    layoutOverride?: StationDocument['layout'],
  ) {
    const existing = await stationRepository.findBySessionAndStationId(sessionId, stationId);
    if (existing) {
      return ensureStationRuntimeState(existing);
    }

    const station = createStationDocument(sessionId, stationId, layoutOverride);
    await stationRepository.create(station);
    publishStationSnapshot(station);
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
    await sessionRepository.save(session);

    applyRuntimeState(station);
    applySessionTrainOccupations(station, session);
    bumpRevision(station);
    await saveAndPublish(station);
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
      await saveAndPublish(currentStation);
    }

    let routeResult = findNextLocalRoute(currentStation, train);
    let steps = routeResult?.steps ?? [];
    let lineblockTransit: MockTrain['lineblockTransit'] = null;
    const affectedStationIds = new Set<string>([currentStation.stationId]);

    if (!routeResult || steps.length === 0) {
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

      routeResult = {
        route: receivingRoute,
        steps: getRouteSteps(receivingStation, receivingRoute),
      };
      steps = routeResult.steps;
      lineblockTransit = {
        linkId: linked.link.id,
        fromStationId: currentStation.stationId,
        toStationId: receivingStation.stationId,
        receivingRouteId: receivingRoute.id,
        entrySignalPieceId,
      };
      train.lineblockTransit = lineblockTransit;
    }

    if (!routeResult || steps.length === 0) {
      throw new Error('The selected route has no remaining movement steps.');
    }
    claimExistingTrainSensorsForRoute(train, routeResult.route, steps[0].stationId);
    assertRouteSignalPermitsMovement(routeResult.route, steps);
    assertMovementSensorsAvailable(session, train.id, stations, steps);

    const movement = {
      id: randomUUID(),
      status: 'running' as const,
      steps,
      nextStepIndex: 0,
      dueAt: new Date(Date.now() + 2000).toISOString(),
      routeRefs: [
        {
          stationId:
            routeResult.route === currentStation.runtime.activeTrainRoutes[routeResult.route.id]
              ? currentStation.stationId
              : steps[0].stationId,
          routeId: routeResult.route.id,
        },
      ],
      lineblockTransit,
    };
    train.status = 'moving';
    train.movement = movement;
    train.updatedAt = nowIso();
    session.updatedAt = nowIso();
    await sessionRepository.save(session);
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
    await sessionRepository.save(session);

    const stationList = await stationRepository.listBySessionId(sessionId);
    const stations = new Map(
      stationList.map((station) => [station.stationId, ensureStationRuntimeState(station)]),
    );
    releaseSensorReservations(stations, train.occupiedSensors);
    await saveTrainStationSnapshots(session, stations, affectedStationIds);
    return { trainId };
  },

  async createStation(
    sessionId: string,
    stationId: string,
    layoutOverride?: StationDocument['layout'],
  ) {
    return this.ensureStation(sessionId, stationId, layoutOverride);
  },

  async createLineblockLink(sessionId: string, endpoints: Pick<SessionLineblockLink, 'a' | 'b'>) {
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
      createdAt,
    };
    session.runtime.lineblocks[linkId] = {
      arrivalAcknowledgementEligible: false,
      trainId: null,
      updatedAt: createdAt,
    };
    session.updatedAt = createdAt;

    await sessionRepository.save(session);
    return session.topology.lineblockLinks[linkId];
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
      await sessionRepository.save(session);
    }
    bumpRevision(localStation);
    bumpRevision(remoteStation);
    await saveAndPublish(localStation);
    await saveAndPublish(remoteStation);

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
        state: 'middleSet',
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
      await stationActionLogRepository.create(toActionLog(station, action));
      await saveAndPublish(station);
      return action;
    }

    action.status = 'running';
    action.startedAt = nowIso();
    station.runtime.pendingActions[action.id] = action;
    applyRuntimeState(station);
    applySessionTrainOccupations(station, session);
    bumpRevision(station);
    await saveAndPublish(station);

    scheduleSwitchAction(station, action);

    return action;
  },

  async submitRouteInteract(command: RouteInteractCommand) {
    const station = await stationRepository.findBySessionAndStationId(
      command.sessionId,
      command.stationId,
    );
    if (!station) {
      throw new Error('Station not found.');
    }

    ensureStationRuntimeState(station);

    const piece = station.layout.pieces[command.payload.pieceId];
    if (!piece) {
      throw new Error('Selected route endpoint was not found.');
    }

    const mode = command.payload.button === 'right' ? 'cancel' : 'build';
    const routeType = command.payload.control;
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

    if (!station.runtime.routeSelection) {
      station.runtime.routeSelection = {
        mode,
        routeType,
        sourcePieceId: command.payload.pieceId,
        sourcePieceType,
        selectedAt: command.issuedAt,
      };
      applyRuntimeState(station);
      bumpRevision(station);
      await saveAndPublish(station);
      return { kind: 'selection-started' as const };
    }

    const selection = station.runtime.routeSelection;
    if (selection.mode !== mode || selection.routeType !== routeType) {
      throw new Error('Finish the current route selection before starting a different action.');
    }

    if (selection.sourcePieceId === command.payload.pieceId) {
      station.runtime.routeSelection = null;
      applyRuntimeState(station);
      bumpRevision(station);
      await saveAndPublish(station);
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
        dueAt: new Date(Date.now() + 2000).toISOString(),
        finishedAt: null,
        payload: {
          routeType: selection.routeType,
          sourcePieceId: selection.sourcePieceId,
          targetPieceId: command.payload.pieceId,
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
      applyRuntimeState(station);
      bumpRevision(station);
      await saveAndPublish(station);

      setTimeout(() => {
        void completeRouteAction(action.id, command.sessionId, command.stationId);
      }, 2000);

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

    const action: PendingAction = {
      id: command.commandId,
      type: selection.routeType === 'shunt' ? 'route:cancel-shunt' : 'route:cancel-normal',
      status: 'queued',
      sessionId: command.sessionId,
      stationId: command.stationId,
      issuedAt: command.issuedAt,
      startedAt: null,
      dueAt: new Date(Date.now() + 2000).toISOString(),
      finishedAt: null,
      payload: {
        routeType: selection.routeType,
        routeId: activeRoute.id,
        sourcePieceId: selection.sourcePieceId,
        targetPieceId: command.payload.pieceId,
      },
    };

    station.runtime.routeSelection = null;
    station.runtime.pendingActions[action.id] = action;
    applyRuntimeState(station);
    bumpRevision(station);
    await saveAndPublish(station);

    setTimeout(() => {
      void completeRouteAction(action.id, command.sessionId, command.stationId);
    }, 2000);

    return { kind: 'cancel-queued' as const, action };
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
      state: command.payload.position,
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
    await saveAndPublish(station);
    return station;
  },
};
