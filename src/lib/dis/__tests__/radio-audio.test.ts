import type { RemoteTrack } from 'livekit-client';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachRadioAudio } from '../../../app/components/dis/radio-audio';

test('radio playback keeps the remote decoder attached during filtering and restores audible fallback', async (context) => {
  const audioDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'AudioContext');
  const streamDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'MediaStream');
  const intervalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setInterval')!;
  const clearDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'clearInterval')!;
  context.after(() => {
    if (audioDescriptor) Object.defineProperty(globalThis, 'AudioContext', audioDescriptor);
    else Reflect.deleteProperty(globalThis, 'AudioContext');
    Object.defineProperty(globalThis, 'setInterval', intervalDescriptor);
    Object.defineProperty(globalThis, 'clearInterval', clearDescriptor);
    if (streamDescriptor) Object.defineProperty(globalThis, 'MediaStream', streamDescriptor);
    else Reflect.deleteProperty(globalThis, 'MediaStream');
  });
  let tick: () => void = () => {};
  Object.defineProperty(globalThis, 'setInterval', {
    configurable: true,
    value: (callback: () => void) => {
      tick = callback;
      return 1;
    },
  });
  Object.defineProperty(globalThis, 'clearInterval', { configurable: true, value: () => {} });
  let input = false;
  let output = false;
  const contexts: FakeAudioContext[] = [];
  const gains: Node[] = [];
  class Node {
    frequency = { value: 0 };
    threshold = { value: 0 };
    knee = { value: 0 };
    ratio = { value: 0 };
    attack = { value: 0 };
    release = { value: 0 };
    gain = { value: 0 };
    curve: Float32Array | null = null;
    oversample = '';
    type = '';
    fftSize = 512;
    connect<T>(next: T): T {
      return next;
    }
    getFloatTimeDomainData(samples: Float32Array) {
      samples.fill(0);
      if (this === contexts[0].inputMeter ? input : output) samples[0] = 0.1;
    }
  }
  class FakeAudioContext {
    state: AudioContextState = 'running';
    destination = new Node();
    inputMeter = new Node();
    private analysers = 0;
    constructor() {
      contexts.push(this);
    }
    createMediaStreamDestination() {
      return Object.assign(new Node(), { stream: {} });
    }
    createMediaStreamSource() {
      return new Node();
    }
    createAnalyser() {
      return this.analysers++ === 0 ? this.inputMeter : new Node();
    }
    createBiquadFilter() {
      return new Node();
    }
    createDynamicsCompressor() {
      return new Node();
    }
    createWaveShaper() {
      return new Node();
    }
    createGain() {
      const gain = new Node();
      gains.push(gain);
      return gain;
    }
    async resume() {}
    async close() {
      this.state = 'closed';
    }
  }
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: FakeAudioContext,
  });
  Object.defineProperty(globalThis, 'MediaStream', { configurable: true, value: class {} });
  const originalStream = {};
  const element = {
    volume: 1,
    srcObject: originalStream,
    muted: false,
    play: async () => {},
    remove: () => {},
  };
  const processed = { ...element, srcObject: {} };
  let attachments = 0;
  let detached = 0;
  const track = {
    mediaStreamTrack: {},
    attach: () => (attachments++ === 0 ? element : processed),
    detach: () => {
      detached++;
    },
  } as unknown as RemoteTrack;
  const container = { appendChild: () => {} } as unknown as HTMLElement;
  let receiveVolume = 2;
  const options = { radio: true, volume: () => receiveVolume };
  const cleanup = attachRadioAudio(track, container, options);
  assert.equal(element.volume, 1, 'boosted playback clamps the media element volume');
  try {
    tick();
    assert.equal(
      element.srcObject,
      originalStream,
      'original audio remains audible when no processed signal is available',
    );
    receiveVolume = 2;
    input = output = true;
    tick();
    assert.equal(element.volume, 0, 'the original decoder keeps playing silently');
    assert.equal(processed.volume, 1, 'only the filtered output is audible');
    assert.equal(gains[0].gain.value, 2, 'Web Audio supplies the 200% receive gain');
    assert.equal(
      element.srcObject,
      originalStream,
      'filtering must never detach the remote stream from its playback element',
    );
    receiveVolume = 1;
    options.radio = false;
    tick();
    assert.equal(
      element.srcObject,
      originalStream,
      'disabling the filter restores unprocessed audio',
    );
    assert.equal(element.volume, 1);
    assert.equal(processed.volume, 0, 'disabling the filter silences only the processed output');
    options.radio = true;
    tick();
    assert.equal(element.srcObject, originalStream);
    assert.equal(element.volume, 0, 'filter can resume without stopping the remote decoder');
    assert.equal(processed.volume, 1);
    output = false;
    for (let index = 0; index < 4; index++) tick();
    assert.equal(
      element.srcObject,
      originalStream,
      'original audio resumes if processing stops while input is active',
    );
    assert.equal(element.volume, 1, 'processing failure restores audible original playback');
    assert.equal(processed.volume, 0);
  } finally {
    cleanup();
  }
  assert.equal(detached, 2, 'both playback elements are detached on hangup');
  assert.equal(contexts[0].state, 'closed');
});
