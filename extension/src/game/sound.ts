// Sound effects synthesised with Web Audio (SPEC §4): no audio files. One mute toggle, remembered.
import { getLocal, setLocal } from './storage.ts';

let ctx: AudioContext | null = null;
let muted = false;
let master: GainNode | null = null;

export async function initSound(): Promise<void> {
  muted = await getLocal('muted', false);
}

export function isMuted(): boolean {
  return muted;
}

export async function setMuted(value: boolean): Promise<void> {
  muted = value;
  if (master) master.gain.value = value ? 0 : 0.5;
  await setLocal('muted', value);
}

function audio(): AudioContext | null {
  if (muted) return null;
  // Browsers only allow sound after a click or key press; before that there is nothing to play (and no warning to log).
  if (typeof navigator !== 'undefined' && navigator.userActivation && !navigator.userActivation.hasBeenActive) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(type: OscillatorType, from: number, to: number, ms: number, gain = 0.3, delay = 0): void {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + delay / 1000;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + ms / 1000);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.05);
}

function noise(ms: number, freq: number, q: number, gain = 0.25, delay = 0, sweepTo?: number): void {
  const a = audio();
  if (!a || !master) return;
  const t0 = a.currentTime + delay / 1000;
  const len = Math.ceil((a.sampleRate * ms) / 1000);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(freq, t0);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t0 + ms / 1000);
  filter.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  /** A bar fills with ink. */
  ink: () => {
    noise(260, 600, 1.2, 0.18, 0, 2400);
    tone('sine', 520, 880, 160, 0.12, 60);
  },
  /** A button or tap answers. */
  tap: () => tone('triangle', 660, 760, 70, 0.08),
  /** Blot asks a question. */
  question: () => {
    tone('sine', 500, 700, 120, 0.12);
    tone('sine', 700, 1000, 140, 0.12, 130);
  },
  reveal: () => tone('triangle', 330, 660, 260, 0.14),
  whoosh: () => noise(700, 300, 0.8, 0.2, 0, 2000),
  hit: (big = false) => {
    tone('sine', big ? 160 : 130, 40, big ? 260 : 170, big ? 0.5 : 0.35);
    noise(big ? 220 : 140, 900, 0.9, big ? 0.35 : 0.22);
  },
  fizzle: () => {
    tone('sawtooth', 420, 70, 520, 0.12);
    noise(400, 3000, 0.6, 0.08, 80, 400);
  },
  backfire: () => {
    tone('sine', 300, 900, 220, 0.18);
    tone('sine', 900, 120, 420, 0.18, 220);
  },
  gulp: () => {
    tone('sine', 240, 90, 200, 0.3);
    tone('sine', 220, 80, 220, 0.3, 260);
  },
  bell: () => {
    tone('sine', 880, 870, 1400, 0.25);
    tone('sine', 1320, 1300, 1100, 0.12);
  },
  ko: () => {
    tone('sine', 200, 30, 700, 0.6);
    noise(600, 500, 0.7, 0.4, 0, 80);
  },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 260, 0.16, i * 110)),
  lose: () => [392, 330, 262].forEach((f, i) => tone('triangle', f, f * 0.98, 320, 0.14, i * 160)),
};
