import type { RemoteTrack } from 'livekit-client';

/** Add a mild cab-radio colour to received speech, preserving the original track. */
export function attachRadioAudio(track: RemoteTrack, container: HTMLElement) {
  const element = track.attach();
  container.appendChild(element);
  let context: AudioContext | undefined;
  let output: MediaStreamAudioDestinationNode | undefined;
  let closed = false;
  try {
    context = new AudioContext();
    const source = context.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 320;
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 3000;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.2;
    const saturation = context.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let index = 0; index < curve.length; index++) {
      const input = (index * 2) / (curve.length - 1) - 1;
      curve[index] = Math.tanh(input * 1.35) / Math.tanh(1.35);
    }
    saturation.curve = curve;
    saturation.oversample = '2x';
    output = context.createMediaStreamDestination();
    source
      .connect(highpass)
      .connect(lowpass)
      .connect(compressor)
      .connect(saturation)
      .connect(output);
    const processedOutput = output;
    // Keep the original attached until the browser permits Web Audio playback.
    void context
      .resume()
      .then(() => {
        if (!closed && context?.state === 'running') {
          element.srcObject = processedOutput.stream;
          void element.play().catch(() => {});
        }
      })
      .catch(() => {});
  } catch {
    // An unsupported audio graph should not prevent the call from being heard.
    void context?.close();
    context = undefined;
  }
  return () => {
    closed = true;
    track.detach(element);
    element.remove();
    output?.stream.getTracks().forEach((outputTrack) => outputTrack.stop());
    if (context && context.state !== 'closed') void context.close();
  };
}

