import { z } from 'zod';

import { stateGroups, tiles } from '@/app/data/tiles';

import type { GridCellRef, PieceRecord, StationLayout } from './layout';
import { getDefaultTextValues, getInitialGroupSelections } from './tile-state';

export type SessionStatus = 'active' | 'closed';
export type PendingActionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ActionLogStatus = Extract<PendingActionStatus, 'completed' | 'failed' | 'cancelled'>;
export type RuntimeInterpreter =
  { kind: 'mock' } | { kind: 'roblox'; placeId: string; serverId: string };

export type SessionDocument = {
  _id: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  mockMode: boolean;
  interpreter: RuntimeInterpreter;
  topology: {
    lineblockLinks: Record<string, SessionLineblockLink>;
  };
  runtime: {
    trains: Record<string, MockTrain>;
    lineblocks: Record<string, SessionLineblockRuntimeState>;
    physicalOccupations: Record<string, PhysicalOccupation>;
  };
};

export type PhysicalOccupation = {
  stationId: string;
  pieceId: string;
  traversalState: string | null;
  occupied: boolean;
  eventId: string;
  observedAt: string;
};

export type SessionLineblockEndpoint = {
  stationId: string;
  pieceId: string;
};

export type SessionLineblockLink = {
  id: string;
  sessionId: string;
  a: SessionLineblockEndpoint;
  b: SessionLineblockEndpoint;
  defaultFlow: 'neutral' | 'a-receiving' | 'b-receiving';
  createdAt: string;
};

export type SessionLineblockRuntimeState = {
  arrivalAcknowledgementEligible: boolean;
  trainId: string | null;
  updatedAt: string;
};

export type TrainDirection = 'left-to-right' | 'right-to-left';
export type MockTrainStatus = 'idle' | 'moving';

export type TrainSensorPosition = {
  stationId: string;
  pieceId: string;
  occupationState: string;
  routeId: string | null;
};

export type TrainMovementStep = {
  stationId: string;
  routeId: string;
  routeStepIndex: number;
  pieceId: string;
  traversalState: string;
  occupationState: string | null;
  signalPieceId: string | null;
};

export type TrainMovement = {
  id: string;
  status: 'running';
  steps: TrainMovementStep[];
  nextStepIndex: number;
  dueAt: string;
  routeRefs: Array<{
    stationId: string;
    routeId: string;
  }>;
  lineblockTransit: {
    linkId: string;
    fromStationId: string;
    toStationId: string;
    receivingRouteId: string;
    entrySignalPieceId: string;
  } | null;
};

export type MockTrain = {
  id: string;
  category: string;
  number: string;
  length: number;
  direction: TrainDirection;
  status: MockTrainStatus;
  occupiedSensors: TrainSensorPosition[];
  location: {
    stationId: string;
    pieceId: string;
    routeId: string | null;
    routeStepIndex: number | null;
  };
  lineblockTransit: TrainMovement['lineblockTransit'];
  movement: TrainMovement | null;
  createdAt: string;
  updatedAt: string;
};

export type PendingAction = {
  id: string;
  type: string;
  status: PendingActionStatus;
  sessionId: string;
  stationId: string;
  issuedAt: string;
  startedAt: string | null;
  dueAt: string | null;
  finishedAt: string | null;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
};

export type LineblockPremainLink = {
  lineblockPieceId: string;
  premainSignalPieceId: string;
};

export type PremainRuntimeState = {
  linkedLineblockPieceId: string;
  canBuildPath: boolean;
};

export type RuntimeRouteDirection = 'left-to-right' | 'right-to-left';
export type RuntimeRouteMode = 'build' | 'cancel';
export type RuntimeRouteType = 'normal' | 'shunt';
export type RuntimeRouteClass = 'premain-to-platform' | 'platform-to-premain' | 'shunt';
export type RuntimeRouteEndpointType =
  | 'premainSignal'
  | 'premainSignalNoOcp'
  | 'departureButton'
  | 'shuntButton'
  | 'shuntButtonNoOcp'
  | 'shuntSignalButtonBuffer';

export type RuntimeRouteSelection = {
  mode: RuntimeRouteMode;
  routeType: RuntimeRouteType;
  sourcePieceId: string;
  sourcePieceType: RuntimeRouteEndpointType;
  sourceControl: 'normal' | 'shunt';
  selectedAt: string;
};

export type ActiveTrainRouteOccupation = {
  pieceId: string;
  state: string;
  variant: string;
};

export type RouteDebugStep = {
  pieceId: string;
  pieceType: string;
  anchor: string;
  cells: string[];
  rotation: 0 | 180;
  mirrored: boolean;
  entry: string;
  exit: string;
  traversableState: string;
  occupationState: string | null;
  occupationVariant: string | null;
  signalIncluded: boolean;
};

export type ActiveTrainRoute = {
  id: string;
  routeType: RuntimeRouteType;
  routeClass: RuntimeRouteClass;
  direction: RuntimeRouteDirection;
  sourcePieceId: string;
  targetPieceId: string;
  sourceControl?: 'normal' | 'shunt';
  targetControl?: 'normal' | 'shunt';
  reservedOccupations: ActiveTrainRouteOccupation[];
  signalPieceIds: string[];
  targetPlatformDepartureSignalPieceId: string | null;
  path: RoutePathStep[];
  passedSignalPieceIds: string[];
  createdAt: string;
};

export type RoutePathStep = {
  pieceId: string;
  traversalState: string;
  occupationState: string | null;
  signalPieceId: string | null;
};

export type PhysicalSwitchAlignment = {
  traversableState: string;
  motorPositions: Partial<Record<'main' | 'upper' | 'lower', 'left' | 'right'>>;
  updatedAt: string;
};

export type RobloxResolvedSignalFamily = 'entry' | 'departure' | 'premain' | 'shunt';

export type RobloxResolvedSignalAspect =
  | 'danger'
  | 'caution'
  | 'proceed'
  | 'shunt'
  | 'proceed40Caution'
  | 'proceed40Proceed'
  | 'proceed40Expect40'
  | 'proceed40Expect60'
  | 'proceed40Expect80'
  | 'proceed40Expect100'
  | 'proceed30'
  | 'proceed40'
  | 'proceed50'
  | 'proceed60'
  | 'proceed80'
  | 'proceed100'
  | 'expect30'
  | 'expect40'
  | 'expect50'
  | 'expect60'
  | 'expect80'
  | 'expect100';

export type StationDocument = {
  _id: string;
  sessionId: string;
  stationId: string;
  revision: number;
  layout: {
    width: number;
    height: number;
    map: GridCellRef[][];
    pieces: Record<string, PieceRecord>;
    connections: Record<string, string>;
  };
  runtime: {
    pendingActions: Record<string, PendingAction>;
    lineblockPremainLinks: Record<string, LineblockPremainLink>;
    premainSignalStates: Record<string, PremainRuntimeState>;
    privolavaciaSelection: PrivolavaciaSelection | null;
    activePrivolavaciaSignals: Record<string, ActivePrivolavaciaSignal>;
    routeSelection: RuntimeRouteSelection | null;
    activeTrainRoutes: Record<string, ActiveTrainRoute>;
    switchAlignments: Record<string, PhysicalSwitchAlignment>;
  };
  createdAt: string;
  updatedAt: string;
};

export type SessionSchemaDocument = {
  version: 1;
  stations: Array<{
    stationId: string;
    layout: StationDocument['layout'];
  }>;
  lineblockLinks: Array<{
    a: SessionLineblockEndpoint;
    b: SessionLineblockEndpoint;
    defaultFlow: SessionLineblockLink['defaultFlow'];
  }>;
};

export type PlaceTemplateDocument = {
  _id: string;
  placeId: string;
  schema: SessionSchemaDocument;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type RobloxPhysicalPieceState = {
  type: string;
  groups: PieceRecord['state']['groups'];
  texts: PieceRecord['state']['texts'];
  switchAlignment: PhysicalSwitchAlignment | null;
  resolvedSignalFamily: RobloxResolvedSignalFamily | null;
  resolvedSignalAspect: RobloxResolvedSignalAspect | null;
};

export type RobloxPhysicalSnapshot = {
  protocolVersion: 1;
  sessionId: string;
  placeId: string;
  generatedAt: string;
  stations: Array<{
    stationId: string;
    revision: number;
    pieces: Record<string, RobloxPhysicalPieceState>;
  }>;
};

export type StationActionLogDocument = {
  _id: string;
  sessionId: string;
  stationId: string;
  actionId: string;
  type: string;
  status: ActionLogStatus;
  issuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
  };
};

export type StationCommand<TPayload> = {
  commandId: string;
  sessionId: string;
  stationId: string;
  type: string;
  issuedAt: string;
  actor: {
    type: 'user' | 'mock-roblox' | 'roblox';
    id: string;
  };
  payload: TPayload;
};

export type SwitchPosition = 'leftSet' | 'middleSet' | 'rightSet';

export type SwitchSetPositionPayload = {
  pieceId: string;
  position: SwitchPosition;
};

export type SwitchSetPositionCommand = StationCommand<SwitchSetPositionPayload> & {
  type: 'switch:set-position';
};

export type LineblockActionType =
  | 'lineblock:grant-consent'
  | 'lineblock:revoke-consent'
  | 'lineblock:mark-departed'
  | 'lineblock:mark-arrived';

export type LineblockActionPayload = {
  pieceId: string;
};

export type LineblockActionCommand = StationCommand<LineblockActionPayload> & {
  type: LineblockActionType;
};

export type RouteInteractPayload = {
  pieceId: string;
  button: 'left' | 'right';
  control: RuntimeRouteType;
};

export type RouteInteractCommand = StationCommand<RouteInteractPayload> & {
  type: 'route:interact';
};

export type PrivolavaciaSelection = {
  sealedCounterPieceId: string;
  selectedAt: string;
};

export type ActivePrivolavaciaSignal = {
  signalPieceId: string;
  sealedCounterPieceId: string;
  activatedAt: string;
};

export type PrivolavaciaInteractPayload = {
  pieceId: string;
  button: 'left' | 'middle' | 'right';
};

export type PrivolavaciaInteractCommand = StationCommand<PrivolavaciaInteractPayload> & {
  type: 'privolavacia:interact';
};

export const sessionIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9:_-]+$/);

export const stationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9:_-]+$/);

export const robloxPlaceIdSchema = z
  .string()
  .trim()
  .regex(/^\d{1,20}$/);

export const pendingActionSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  sessionId: sessionIdSchema,
  stationId: stationIdSchema,
  issuedAt: z.string(),
  startedAt: z.string().nullable(),
  dueAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export const stationLayoutSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  map: z.array(z.array(z.string())),
  pieces: z.record(z.string(), z.any()),
  connections: z.record(z.string(), z.string()),
});

export const stationDocumentSchema = z.object({
  _id: z.string(),
  sessionId: sessionIdSchema,
  stationId: stationIdSchema,
  revision: z.number().int().nonnegative(),
  layout: stationLayoutSchema,
  runtime: z.object({
    pendingActions: z.record(z.string(), pendingActionSchema),
    lineblockPremainLinks: z.record(
      z.string(),
      z.object({
        lineblockPieceId: z.string().trim().min(1),
        premainSignalPieceId: z.string().trim().min(1),
      }),
    ),
    premainSignalStates: z.record(
      z.string(),
      z.object({
        linkedLineblockPieceId: z.string().trim().min(1),
        canBuildPath: z.boolean(),
      }),
    ),
    privolavaciaSelection: z
      .object({
        sealedCounterPieceId: z.string().trim().min(1),
        selectedAt: z.string(),
      })
      .nullable()
      .default(null),
    activePrivolavaciaSignals: z
      .record(
        z.string(),
        z.object({
          signalPieceId: z.string().trim().min(1),
          sealedCounterPieceId: z.string().trim().min(1),
          activatedAt: z.string(),
        }),
      )
      .default({}),
    routeSelection: z
      .object({
        mode: z.enum(['build', 'cancel']),
        routeType: z.enum(['normal', 'shunt']),
        sourcePieceId: z.string().trim().min(1),
        sourcePieceType: z.enum([
          'premainSignal',
          'premainSignalNoOcp',
          'departureButton',
          'shuntButton',
          'shuntButtonNoOcp',
          'shuntSignalButtonBuffer',
        ]),
        sourceControl: z.enum(['normal', 'shunt']),
        selectedAt: z.string(),
      })
      .nullable(),
    activeTrainRoutes: z.record(
      z.string(),
      z.object({
        id: z.string().trim().min(1),
        routeType: z.enum(['normal', 'shunt']),
        routeClass: z.enum(['premain-to-platform', 'platform-to-premain', 'shunt']),
        direction: z.enum(['left-to-right', 'right-to-left']),
        sourcePieceId: z.string().trim().min(1),
        targetPieceId: z.string().trim().min(1),
        sourceControl: z.enum(['normal', 'shunt']).optional(),
        targetControl: z.enum(['normal', 'shunt']).optional(),
        reservedOccupations: z.array(
          z.object({
            pieceId: z.string().trim().min(1),
            state: z.string().trim().min(1),
            variant: z.string().trim().min(1),
          }),
        ),
        signalPieceIds: z.array(z.string().trim().min(1)),
        targetPlatformDepartureSignalPieceId: z.string().trim().min(1).nullable(),
        path: z.array(
          z.object({
            pieceId: z.string().trim().min(1),
            traversalState: z.string().trim().min(1),
            occupationState: z.string().trim().min(1).nullable(),
            signalPieceId: z.string().trim().min(1).nullable(),
          }),
        ),
        passedSignalPieceIds: z.array(z.string().trim().min(1)),
        createdAt: z.string(),
      }),
    ),
    switchAlignments: z.record(
      z.string(),
      z.object({
        traversableState: z.string().trim().min(1),
        motorPositions: z
          .object({
            main: z.enum(['left', 'right']).optional(),
            upper: z.enum(['left', 'right']).optional(),
            lower: z.enum(['left', 'right']).optional(),
          })
          .default({}),
        updatedAt: z.string(),
      }),
    ),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const sessionDocumentSchema = z.object({
  _id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: z.enum(['active', 'closed']),
  mockMode: z.boolean().default(true),
  interpreter: z
    .discriminatedUnion('kind', [
      z.object({ kind: z.literal('mock') }),
      z.object({
        kind: z.literal('roblox'),
        placeId: robloxPlaceIdSchema,
        serverId: sessionIdSchema,
      }),
    ])
    .default({ kind: 'mock' }),
  topology: z.object({
    lineblockLinks: z.record(
      z.string(),
      z.object({
        id: z.string(),
        sessionId: sessionIdSchema,
        a: z.object({
          stationId: stationIdSchema,
          pieceId: z.string().trim().min(1),
        }),
        b: z.object({
          stationId: stationIdSchema,
          pieceId: z.string().trim().min(1),
        }),
        defaultFlow: z.enum(['neutral', 'a-receiving', 'b-receiving']).default('neutral'),
        createdAt: z.string(),
      }),
    ),
  }),
  runtime: z.object({
    trains: z.record(
      z.string(),
      z.object({
        id: z.string(),
        category: z.string(),
        number: z.string(),
        length: z.number().int().positive(),
        direction: z.enum(['left-to-right', 'right-to-left']),
        status: z.enum(['idle', 'moving']),
        occupiedSensors: z.array(
          z.object({
            stationId: stationIdSchema,
            pieceId: z.string(),
            occupationState: z.string(),
            routeId: z.string().nullable().default(null),
          }),
        ),
        location: z.object({
          stationId: stationIdSchema,
          pieceId: z.string(),
          routeId: z.string().nullable(),
          routeStepIndex: z.number().int().nonnegative().nullable(),
        }),
        lineblockTransit: z
          .object({
            linkId: z.string(),
            fromStationId: stationIdSchema,
            toStationId: stationIdSchema,
            receivingRouteId: z.string(),
            entrySignalPieceId: z.string(),
          })
          .nullable(),
        movement: z.any().nullable(),
        createdAt: z.string(),
        updatedAt: z.string(),
      }),
    ),
    lineblocks: z.record(
      z.string(),
      z.object({
        arrivalAcknowledgementEligible: z.boolean(),
        trainId: z.string().nullable(),
        updatedAt: z.string(),
      }),
    ),
    physicalOccupations: z
      .record(
        z.string(),
        z.object({
          stationId: stationIdSchema,
          pieceId: z.string().trim().min(1),
          traversalState: z.string().trim().min(1).nullable(),
          occupied: z.boolean(),
          eventId: z.string().trim().min(1),
          observedAt: z.string(),
        }),
      )
      .default({}),
  }),
});

export const createMockTrainSchema = z.object({
  category: z.string().trim().min(1).max(12),
  number: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[a-zA-Z0-9-]+$/),
  length: z.number().int().min(1).max(100),
  stationId: stationIdSchema,
  pieceId: z.string().trim().min(1),
  direction: z.enum(['left-to-right', 'right-to-left']),
});

export const createStationSchema = z.object({
  sessionId: sessionIdSchema,
  stationId: stationIdSchema,
  layout: stationLayoutSchema.optional(),
});

export const createLineblockLinkSchema = z.object({
  sessionId: sessionIdSchema,
  a: z.object({
    stationId: stationIdSchema,
    pieceId: z.string().trim().min(1),
  }),
  b: z.object({
    stationId: stationIdSchema,
    pieceId: z.string().trim().min(1),
  }),
  defaultFlow: z.enum(['neutral', 'a-receiving', 'b-receiving']).default('neutral'),
});

export const sessionSchemaDocumentSchema = z.object({
  version: z.literal(1),
  stations: z.array(
    z.object({
      stationId: stationIdSchema,
      layout: stationLayoutSchema,
    }),
  ),
  lineblockLinks: z.array(
    z.object({
      a: z.object({
        stationId: stationIdSchema,
        pieceId: z.string().trim().min(1),
      }),
      b: z.object({
        stationId: stationIdSchema,
        pieceId: z.string().trim().min(1),
      }),
      defaultFlow: z.enum(['neutral', 'a-receiving', 'b-receiving']).default('neutral'),
    }),
  ),
});

export const robloxSessionRegistrationSchema = z.object({
  sessionId: sessionIdSchema,
  placeId: robloxPlaceIdSchema,
  serverId: sessionIdSchema,
});

export const robloxOccupationEventSchema = z.object({
  eventId: z.string().trim().min(1).max(128),
  stationId: stationIdSchema,
  pieceId: z.string().trim().min(1).max(128),
  traversalState: z.string().trim().min(1).max(128).nullable().optional(),
  occupied: z.boolean(),
  observedAt: z.string(),
});

export const robloxSwitchFeedbackSchema = z.object({
  eventId: z.string().trim().min(1).max(128),
  stationId: stationIdSchema,
  pieceId: z.string().trim().min(1).max(128),
  controlSlot: z.enum(['main', 'upper', 'lower']),
  position: z.enum(['left', 'right']),
  observedAt: z.string(),
});

export const switchSetPositionCommandSchema = z.object({
  commandId: z.string().trim().min(1),
  sessionId: sessionIdSchema,
  stationId: stationIdSchema,
  type: z.literal('switch:set-position'),
  issuedAt: z.string(),
  actor: z.object({
    type: z.enum(['user', 'mock-roblox']),
    id: z.string().trim().min(1),
  }),
  payload: z.object({
    pieceId: z.string().trim().min(1),
    position: z.enum(['leftSet', 'middleSet', 'rightSet']),
  }),
});

export const mockInboundSwitchUpdateSchema = z.object({
  actorId: z.string().trim().min(1).default('mock-roblox'),
  pieceId: z.string().trim().min(1),
  position: z.enum(['leftSet', 'middleSet', 'rightSet']),
});

export const lineblockActionCommandSchema = z.object({
  commandId: z.string().trim().min(1),
  sessionId: sessionIdSchema,
  stationId: stationIdSchema,
  type: z.enum([
    'lineblock:grant-consent',
    'lineblock:revoke-consent',
    'lineblock:mark-departed',
    'lineblock:mark-arrived',
  ]),
  issuedAt: z.string(),
  actor: z.object({
    type: z.enum(['user', 'mock-roblox']),
    id: z.string().trim().min(1),
  }),
  payload: z.object({
    pieceId: z.string().trim().min(1),
  }),
});

export const routeInteractCommandSchema = z.object({
  commandId: z.string().trim().min(1),
  sessionId: sessionIdSchema,
  stationId: stationIdSchema,
  type: z.literal('route:interact'),
  issuedAt: z.string(),
  actor: z.object({
    type: z.enum(['user', 'mock-roblox']),
    id: z.string().trim().min(1),
  }),
  payload: z.object({
    pieceId: z.string().trim().min(1),
    button: z.enum(['left', 'right']),
    control: z.enum(['normal', 'shunt']),
  }),
});

export const privolavaciaInteractCommandSchema = z.object({
  commandId: z.string().trim().min(1),
  sessionId: sessionIdSchema,
  stationId: stationIdSchema,
  type: z.literal('privolavacia:interact'),
  issuedAt: z.string(),
  actor: z.object({
    type: z.enum(['user', 'mock-roblox']),
    id: z.string().trim().min(1),
  }),
  payload: z.object({
    pieceId: z.string().trim().min(1),
    button: z.enum(['left', 'middle', 'right']),
  }),
});

export function serializeStationLayout(layout: StationLayout): StationDocument['layout'] {
  return clonePlain(normalizeStationLayout(layout));
}

export function deserializeStationLayout(layout: StationDocument['layout']): StationLayout {
  return normalizeStationLayout(clonePlain(layout));
}

export function normalizeStationLayout(layout: StationLayout): StationLayout {
  return {
    ...layout,
    pieces: Object.fromEntries(
      Object.entries(layout.pieces).map(([pieceId, piece]) => [
        pieceId,
        normalizePieceRecord(pieceId, piece),
      ]),
    ),
  };
}

function normalizePieceRecord(pieceId: string, piece: PieceRecord): PieceRecord {
  const tile = tiles[piece.type];

  if (!tile) {
    throw new Error(`Unknown tile type "${piece.type}" for piece "${pieceId}".`);
  }

  const defaultGroups = getInitialGroupSelections(tile, stateGroups);
  const defaultTexts = getDefaultTextValues(tile);
  const existingGroups = piece.state?.groups ?? {};
  const existingTexts = piece.state?.texts ?? {};

  return {
    ...piece,
    state: {
      groups: Object.fromEntries(
        Object.entries(defaultGroups).map(([groupKey, defaultSelection]) => [
          groupKey,
          existingGroups[groupKey] ?? { ...defaultSelection },
        ]),
      ),
      texts: {
        ...defaultTexts,
        ...existingTexts,
      },
    },
  };
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
