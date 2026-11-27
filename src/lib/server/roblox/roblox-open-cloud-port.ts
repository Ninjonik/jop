import { sessionRepository } from '../repositories/session-repository';
import { recordSessionActivity } from '../session-activity';
import type { RuntimeInterpreterPort, RuntimeInvalidation } from './runtime-interpreter';

const DEFAULT_TOPIC = 'JOPRuntime';

function getOpenCloudConfiguration(universeId: string) {
  const apiKey = process.env.ROBLOX_API_KEY?.trim();
  const topic = process.env.ROBLOX_MESSAGING_TOPIC?.trim() || DEFAULT_TOPIC;

  if (!apiKey) {
    throw new Error('ROBLOX_API_KEY is required for Roblox sessions.');
  }

  return { universeId, apiKey, topic };
}

async function publishInvalidation(event: RuntimeInvalidation) {
  const session = await sessionRepository.findById(event.sessionId);
  if (!session || session.interpreter.kind !== 'roblox') {
    return;
  }
  const { universeId, apiKey, topic } = getOpenCloudConfiguration(session.interpreter.universeId);
  const started = performance.now();
  recordSessionActivity({
    sessionId: event.sessionId,
    source: 'server',
    event: 'roblox.notify.started',
    level: 'info',
  });
  try {
    const response = await fetch(
      `https://apis.roblox.com/cloud/v2/universes/${encodeURIComponent(universeId)}:publishMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          topic,
          message: JSON.stringify(event),
        }),
      },
    );

    recordSessionActivity({
      sessionId: event.sessionId,
      source: 'server',
      event: 'roblox.notify.response',
      level: response.ok ? 'info' : 'error',
      durationMs: Math.round(performance.now() - started),
      details: { status: response.status },
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Roblox Open Cloud returned ${response.status}: ${details}`);
    }
  } catch (error) {
    recordSessionActivity({
      sessionId: event.sessionId,
      source: 'server',
      event: 'roblox.notify.failed',
      level: 'error',
      durationMs: Math.round(performance.now() - started),
    });
    throw error;
  }
}

export const robloxRuntimeInterpreter: RuntimeInterpreterPort = {
  sessionChanged: publishInvalidation,
};
