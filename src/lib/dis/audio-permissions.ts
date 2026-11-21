export const audioPermissionRequired = 'dis-audio-permission-required';

export function reportAudioPermissionError(error: unknown) {
  if (error instanceof Error && ['NotAllowedError', 'SecurityError'].includes(error.name))
    window.dispatchEvent(new Event(audioPermissionRequired));
}
