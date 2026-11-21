'use client';

import { getBrowserSettings } from '@/lib/dis/browser-settings';

const soundPaths = {
  incoming: '/sounds/telephone-ring-iskra.ogg',
  outgoing: '/sounds/telephone-pickup.ogg',
} as const;

/** Plays short local UI cues without making chat delivery depend on audio support. */
export function playMessageSound(kind: keyof typeof soundPaths) {
  const settings = getBrowserSettings();
  if ((kind === 'incoming' && !settings.incomingMessageSounds) ||
      (kind === 'outgoing' && !settings.outgoingMessageSounds)) return;

  const audio = new Audio(soundPaths[kind]);
  audio.volume = settings.messageVolume;
  void (async () => {
    if (settings.speaker && 'setSinkId' in audio)
      await audio.setSinkId(settings.speaker).catch(() => undefined);
    await audio.play().catch(() => undefined);
  })();
}
