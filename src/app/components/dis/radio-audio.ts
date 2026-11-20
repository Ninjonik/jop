import { getBrowserSettings } from '@/lib/dis/browser-settings';
import type { RemoteTrack } from 'livekit-client';

/** Keep LiveKit playback as a fallback until the radio graph produces audio. */
export function attachRadioAudio(
  track: RemoteTrack,
  container: HTMLElement,
  options: { radio?: boolean; volume?: () => number } = {},
) {
  const element = track.attach();
  container.appendChild(element);
  const updateOutput = () => {
    const settings = getBrowserSettings();
    element.volume = settings.volume * (options.volume?.() ?? 1);
    if ('setSinkId' in element)
      void element.setSinkId(settings.speaker).catch(() => {
        container.dispatchEvent(new CustomEvent('audio-device-error', { bubbles: true }));
      });
    else if (settings.speaker)
      container.dispatchEvent(new CustomEvent('audio-device-error', { bubbles: true }));
  };
  updateOutput();
  globalThis.window?.addEventListener('dis-audio-settings', updateOutput);
  let context: AudioContext | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let processing = false;
  let silentSamples = 0;
  try {
    context = new AudioContext();
    // Route processed audio through the same element so speaker selection applies
    // equally to filtered playback and its original-track fallback.
    const destination = context.createMediaStreamDestination();
    const originalStream = element.srcObject;
    const audioContext = context;
    const source = context.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
    const inputMeter = context.createAnalyser();
    inputMeter.fftSize = 512;
    source.connect(inputMeter);
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
    const outputMeter = context.createAnalyser();
    outputMeter.fftSize = 512;
    const gain = context.createGain();
    gain.gain.value = 0;
    source
      .connect(highpass)
      .connect(lowpass)
      .connect(compressor)
      .connect(saturation)
      .connect(outputMeter)
      .connect(gain)
      .connect(destination);
    const inputSamples = new Float32Array(inputMeter.fftSize);
    const outputSamples = new Float32Array(outputMeter.fftSize);
    const hasSignal = (samples: Float32Array) => samples.some((sample) => Math.abs(sample) > 0.002);
    const restoreOriginal = () => {
      gain.gain.value = 0;
      element.srcObject = originalStream;
      element.muted = false;
      processing = false;
      void element.play().catch(() => {});
    };
    timer = setInterval(() => {
      if (closed) return;
      if (options.radio === false || !getBrowserSettings().radioSimulation) {
        if (processing) restoreOriginal();
        return;
      }
      if (audioContext.state !== 'running') {
        if (processing) restoreOriginal();
        return;
      }
      inputMeter.getFloatTimeDomainData(inputSamples);
      outputMeter.getFloatTimeDomainData(outputSamples);
      const inputActive = hasSignal(inputSamples);
      const outputActive = hasSignal(outputSamples);
      if (!processing && outputActive) {
        element.srcObject = destination.stream;
        void element.play().catch(() => {});
        gain.gain.value = 1;
        processing = true;
        silentSamples = 0;
      } else if (processing && inputActive && !outputActive) {
        if (++silentSamples >= 4) restoreOriginal();
      } else {
        silentSamples = 0;
      }
    }, 150);
    void context.resume().catch(() => {});
  } catch {
    // If Web Audio is unavailable, the original LiveKit element stays audible.
    if (context && context.state !== 'closed') void context.close();
    context = undefined;
  }
  return () => {
    closed = true;
    globalThis.window?.removeEventListener('dis-audio-settings', updateOutput);
    if (timer) clearInterval(timer);
    track.detach(element);
    element.remove();
    if (context && context.state !== 'closed') void context.close();
  };
}
