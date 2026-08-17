import { z } from 'zod';

import type { GridCellRef, PieceRecord, StationLayout } from './layout';

export type SessionStatus = 'active' | 'closed';
export type PendingActionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ActionLogStatus = Extract<PendingActionStatus, 'completed' | 'failed' | 'cancelled'>;

export type SessionDocument = {
  _id: string;
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  mockMode: true;
  topology: {
    lineblockLinks: Record<string, SessionLineblockLink>;
  };
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
  createdAt: string;
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
  };
  createdAt: string;
  updatedAt: string;
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
    type: 'user' | 'mock-roblox';
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
      })
    ),
    premainSignalStates: z.record(
      z.string(),
      z.object({
        linkedLineblockPieceId: z.string().trim().min(1),
        canBuildPath: z.boolean(),
      })
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
  mockMode: z.literal(true),
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
        createdAt: z.string(),
      })
    ),
  }),
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

export function serializeStationLayout(layout: StationLayout): StationDocument['layout'] {
  return clonePlain(layout);
}

export function deserializeStationLayout(layout: StationDocument['layout']): StationLayout {
  return clonePlain(layout);
}

function clonePlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
