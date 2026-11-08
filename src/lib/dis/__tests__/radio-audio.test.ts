import type { RemoteTrack } from 'livekit-client';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachRadioAudio } from '../../../app/components/dis/radio-audio';

test('radio playback keeps the original audio until processing works and restores it if it stops', async (context) => {
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
      return new Node();
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
  const element = { muted: false, play: async () => {}, remove: () => {} };
  let detached = false;
  const track = {
    mediaStreamTrack: {},
    attach: () => element,
    detach: () => {
      detached = true;
    },
  } as unknown as RemoteTrack;
  const container = { appendChild: () => {} } as unknown as HTMLElement;
  const cleanup = attachRadioAudio(track, container);
  try {
    tick();
    assert.equal(
      element.muted,
      false,
      'original audio remains audible when no processed signal is available',
    );
    input = output = true;
    tick();
    assert.equal(
      element.muted,
      true,
      'radio audio takes over after a processed signal is detected',
    );
    output = false;
    for (let index = 0; index < 4; index++) tick();
    assert.equal(
      element.muted,
      false,
      'original audio resumes if processing stops while input is active',
    );
  } finally {
    cleanup();
  }
  assert.equal(detached, true);
  assert.equal(contexts[0].state, 'closed');
});
