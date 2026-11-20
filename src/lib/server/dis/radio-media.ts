import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import type { RadioMedia } from './radio-calls';

export function assertVoiceConfigured() {
  if (!process.env.LIVEKIT_URL || !process.env.LIVEKIT_API_KEY || !process.env.LIVEKIT_API_SECRET)
    throw new Error('Hlasové spojenie nie je nakonfigurované.');
}
function service() {
  assertVoiceConfigured();
  return new RoomServiceClient(
    process.env.LIVEKIT_URL!.replace(/^ws/, 'http'),
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { requestTimeout: 2, failover: false },
  );
}
async function ignoreMissing(operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (('status' in error && error.status === 404) ||
        ('code' in error && error.code === 'not_found'))
    )
      return;
    throw error;
  }
}
export const radioMedia: RadioMedia = {
  async credentials(id, socketId, publish) {
    assertVoiceConfigured();
    const token = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
      identity: socketId,
      ttl: '10m',
    });
    token.addGrant({
      roomJoin: true,
      room: `_jop_${id}`,
      canPublish: publish,
      ...(publish ? { canPublishSources: [TrackSource.MICROPHONE] } : {}),
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    return { id, url: process.env.LIVEKIT_URL!, token: await token.toJwt() };
  },
  async close(id) {
    await ignoreMissing(() => service().deleteRoom(`_jop_${id}`));
  },
  async remove(id, socketId) {
    await ignoreMissing(() => service().removeParticipant(`_jop_${id}`, socketId));
  },
};
