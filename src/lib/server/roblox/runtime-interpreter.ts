import type {
  RobloxPhysicalSnapshot,
  SessionDocument,
} from '@/lib/station/domain';
import { buildRobloxUpdateDebugLine } from '@/lib/station/debug';

import { robloxRuntimeStateRepository } from '../repositories/roblox-runtime-state-repository';
import { robloxRuntimeUpdateRepository } from '../repositories/roblox-runtime-update-repository';
import { sessionRepository } from '../repositories/session-repository';
import { printDebugBlock } from '../debug-log';
import { mockRuntimeInterpreter } from './mock-roblox-port';
import { robloxRuntimeInterpreter } from './roblox-open-cloud-port';

export type RuntimeInvalidation = {
  type: 'session:changed';
  sessionId: string;
  issuedAt: string;
};

export interface RuntimeInterpreterPort {
  sessionChanged(event: RuntimeInvalidation): Promise<void>;
}

const robloxSessionSyncLocks = new Map<string, Promise<void>>();

function getInterpreter(session: SessionDocument): RuntimeInterpreterPort {
  return session.interpreter?.kind === 'roblox' ? robloxRuntimeInterpreter : mockRuntimeInterpreter;
}

function queueRobloxSessionSync(sessionId: string, task: () => Promise<void>) {
  const previous = robloxSessionSyncLocks.get(sessionId) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(task)
    .finally(() => {
      if (robloxSessionSyncLocks.get(sessionId) === next) {
        robloxSessionSyncLocks.delete(sessionId);
      }
    });

  robloxSessionSyncLocks.set(sessionId, next);
  return next;
}

function flattenSnapshot(snapshot: RobloxPhysicalSnapshot) {
  const pieces = new Map<string, RobloxPhysicalSnapshot['stations'][number]['pieces'][string]>();

  snapshot.stations.forEach((station) => {
    Object.entries(station.pieces).forEach(([pieceId, piece]) => {
      pieces.set(`${station.stationId}\0${pieceId}`, piece);
    });
  });

  return pieces;
}

function arePieceStatesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function synchronizeRobloxRuntimeState(
  sessionId: string,
  snapshotFactory: () => Promise<RobloxPhysicalSnapshot>,
) {
  const snapshot = await snapshotFactory();
  const state = await robloxRuntimeStateRepository.findBySessionId(sessionId);
  const previousSnapshot = state?.lastSnapshot ?? null;
  const previousSequence = state?.latestSequence ?? 0;
  const previousPieces = previousSnapshot ? flattenSnapshot(previousSnapshot) : new Map();
  const nextPieces = flattenSnapshot(snapshot);
  const updates = [];
  let nextSequence = previousSequence;

  for (const [pieceKey, piece] of nextPieces.entries()) {
    const previousPiece = previousPieces.get(pieceKey);
    if (previousPiece && arePieceStatesEqual(previousPiece, piece)) {
      continue;
    }

    const [stationId, pieceId] = pieceKey.split('\0', 2);
    nextSequence += 1;
    updates.push({
      _id: `${sessionId}:${nextSequence}`,
      sessionId,
      sequence: nextSequence,
      stationId,
      pieceId,
      piece,
      createdAt: snapshot.generatedAt,
    });
  }

  await robloxRuntimeUpdateRepository.insertMany(updates);
  await robloxRuntimeStateRepository.save({
    _id: sessionId,
    sessionId,
    latestSequence: nextSequence,
    lastSnapshot: snapshot,
    createdAt: state?.createdAt ?? snapshot.generatedAt,
    updatedAt: snapshot.generatedAt,
  });

  if (updates.length === 0) {
    return;
  }

  printDebugBlock(
    'roblox-debug',
    `publishing ${updates.length} physical updates for ${sessionId}`,
    updates.map((update) => buildRobloxUpdateDebugLine(update.stationId, update.pieceId, update.piece)),
  );

  const session = await sessionRepository.findById(sessionId);
  if (!session) {
    return;
  }

  const event: RuntimeInvalidation = {
    type: 'session:changed',
    sessionId,
    issuedAt: new Date().toISOString(),
  };

  try {
    await getInterpreter(session).sessionChanged(event);
  } catch (error) {
    console.error(
      `[runtime-interpreter] Failed to notify ${session.interpreter?.kind ?? 'mock'} session ${sessionId}:`,
      error,
    );
  }
}

export async function initializeRobloxRuntimeState(
  sessionId: string,
  snapshotFactory: () => Promise<RobloxPhysicalSnapshot>,
) {
  return queueRobloxSessionSync(sessionId, async () => {
    const snapshot = await snapshotFactory();
    await robloxRuntimeUpdateRepository.deleteBySessionId(sessionId);
    await robloxRuntimeStateRepository.save({
      _id: sessionId,
      sessionId,
      latestSequence: 0,
      lastSnapshot: snapshot,
      createdAt: snapshot.generatedAt,
      updatedAt: snapshot.generatedAt,
    });
  });
}

export async function notifyRuntimeInterpreter(
  sessionId: string,
  snapshotFactory?: () => Promise<RobloxPhysicalSnapshot>,
) {
  const session = await sessionRepository.findById(sessionId);
  if (!session) {
    return;
  }

  if (session.interpreter?.kind === 'roblox') {
    if (!snapshotFactory) {
      throw new Error('A Roblox snapshot factory is required for Roblox runtime invalidation.');
    }

    await queueRobloxSessionSync(sessionId, () =>
      synchronizeRobloxRuntimeState(sessionId, snapshotFactory),
    );
    return;
  }

  const event: RuntimeInvalidation = {
    type: 'session:changed',
    sessionId,
    issuedAt: new Date().toISOString(),
  };

  try {
    await getInterpreter(session).sessionChanged(event);
  } catch (error) {
    console.error(
      `[runtime-interpreter] Failed to notify ${session.interpreter?.kind ?? 'mock'} session ${sessionId}:`,
      error,
    );
  }
}
