import type { SessionDocument } from '@/lib/station/domain';

import { sessionRepository } from '../repositories/session-repository';
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

function getInterpreter(session: SessionDocument): RuntimeInterpreterPort {
  return session.interpreter?.kind === 'roblox' ? robloxRuntimeInterpreter : mockRuntimeInterpreter;
}

export async function notifyRuntimeInterpreter(sessionId: string) {
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
