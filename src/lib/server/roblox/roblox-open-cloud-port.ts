import type { RuntimeInterpreterPort, RuntimeInvalidation } from './runtime-interpreter';
import { sessionRepository } from '../repositories/session-repository';

const DEFAULT_TOPIC = 'JOPRuntime';

function getOpenCloudConfiguration(universeId: string) {
  const apiKey = process.env.ROBLOX_OPEN_CLOUD_API_KEY?.trim();
  const topic = process.env.ROBLOX_MESSAGING_TOPIC?.trim() || DEFAULT_TOPIC;

  if (!apiKey) {
    throw new Error(
      'ROBLOX_OPEN_CLOUD_API_KEY is required for Roblox sessions.',
    );
  }

  return { universeId, apiKey, topic };
}

async function publishInvalidation(event: RuntimeInvalidation) {
  const session = await sessionRepository.findById(event.sessionId);
  if (!session || session.interpreter.kind !== 'roblox') {
    return;
  }
  const { universeId, apiKey, topic } = getOpenCloudConfiguration(session.interpreter.universeId);
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

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Roblox Open Cloud returned ${response.status}: ${details}`);
  }
}

export const robloxRuntimeInterpreter: RuntimeInterpreterPort = {
  sessionChanged: publishInvalidation,
};
