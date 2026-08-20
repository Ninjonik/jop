import type { RuntimeInterpreterPort, RuntimeInvalidation } from './runtime-interpreter';

const DEFAULT_TOPIC = 'JOPRuntime';

function getOpenCloudConfiguration() {
  const universeId = process.env.ROBLOX_UNIVERSE_ID?.trim();
  const apiKey = process.env.ROBLOX_OPEN_CLOUD_API_KEY?.trim();
  const topic = process.env.ROBLOX_MESSAGING_TOPIC?.trim() || DEFAULT_TOPIC;

  if (!universeId || !apiKey) {
    throw new Error(
      'ROBLOX_UNIVERSE_ID and ROBLOX_OPEN_CLOUD_API_KEY are required for Roblox sessions.',
    );
  }

  return { universeId, apiKey, topic };
}

async function publishInvalidation(event: RuntimeInvalidation) {
  const { universeId, apiKey, topic } = getOpenCloudConfiguration();
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
