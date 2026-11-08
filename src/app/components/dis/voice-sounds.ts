type CallSoundKind = 'telephone' | 'radio';
type Tone = { frequency: number; start: number; duration: number };

const telephoneRings = [
  '/sounds/telephone-ring.ogg',
  '/sounds/telephone-ring-iskra.ogg',
  '/sounds/telephone-ring-tesla.ogg',
];
const radioRings: Tone[][] = [
  [
    { frequency: 950, start: 0, duration: 0.13 },
    { frequency: 1200, start: 0.18, duration: 0.13 },
    { frequency: 950, start: 0.36, duration: 0.13 },
  ],
  [
    { frequency: 1050, start: 0, duration: 0.18 },
    { frequency: 1350, start: 0.24, duration: 0.18 },
  ],
  [
    { frequency: 1200, start: 0, duration: 0.11 },
    { frequency: 1000, start: 0.15, duration: 0.11 },
    { frequency: 1200, start: 0.3, duration: 0.2 },
  ],
];
const radioPickup: Tone[][] = [
  [
    { frequency: 880, start: 0, duration: 0.1 },
    { frequency: 1175, start: 0.12, duration: 0.16 },
  ],
  [
    { frequency: 1000, start: 0, duration: 0.09 },
    { frequency: 1350, start: 0.11, duration: 0.14 },
  ],
];
const radioHangup: Tone[][] = [
  [
    { frequency: 900, start: 0, duration: 0.13 },
    { frequency: 650, start: 0.16, duration: 0.18 },
  ],
  [
    { frequency: 1000, start: 0, duration: 0.1 },
    { frequency: 700, start: 0.13, duration: 0.22 },
  ],
];
const previous = new Map<string, number>();
function variation<T>(group: string, choices: T[]): T {
  const last = previous.get(group);
  let index = Math.floor(Math.random() * choices.length);
  if (choices.length > 1 && index === last) index = (index + 1) % choices.length;
  previous.set(group, index);
  return choices[index];
}
function playTones(context: AudioContext, tones: Tone[], volume: number) {
  const now = context.currentTime;
  for (const tone of tones) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + tone.start;
    oscillator.frequency.value = tone.frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.01);
    gain.gain.setValueAtTime(volume, start + tone.duration - 0.01);
    gain.gain.linearRampToValueAtTime(0, start + tone.duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + tone.duration);
  }
}

/** Starts an alert and returns a cleanup function. Browsers may require prior interaction. */
export function startCallRing(kind: CallSoundKind, incoming: boolean, onBlocked: () => void) {
  if (kind === 'telephone') {
    const sound = new Audio(variation('telephone-ring', telephoneRings));
    sound.loop = true;
    sound.volume = incoming ? 0.7 : 0.25;
    void sound.play().catch(onBlocked);
    return () => {
      sound.pause();
      sound.currentTime = 0;
    };
  }
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    onBlocked();
    return () => {};
  }
  const tones = variation('radio-ring', radioRings);
  const play = () => playTones(context, tones, incoming ? 0.07 : 0.04);
  play();
  const timer = setInterval(play, 2200);
  void context.resume().catch(onBlocked);
  return () => {
    clearInterval(timer);
    void context.close();
  };
}

export function playCallCue(kind: CallSoundKind, cue: 'pickup' | 'hangup') {
  if (kind === 'telephone') {
    const sound = new Audio(`/sounds/telephone-${cue}.ogg`);
    sound.volume = 0.6;
    // Small pitch variations make repeated handset actions less mechanical.
    sound.playbackRate = variation(`telephone-${cue}`, [0.95, 1, 1.05]);
    void sound.play().catch(() => {});
    return;
  }
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return;
  }
  const tones = variation(`radio-${cue}`, cue === 'pickup' ? radioPickup : radioHangup);
  playTones(context, tones, 0.06);
  void context.resume().catch(() => {});
  setTimeout(() => void context.close(), 1000);
}
