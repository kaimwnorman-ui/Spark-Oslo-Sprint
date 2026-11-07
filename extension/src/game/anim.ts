// Timing and easing. Every wait goes through the round's speed (demo mode is 1.5x).

export const reducedMotion = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

let speed = 1;
/** 1 normally, 1.5 in demo mode; ?fast=1 (tests only) makes everything near-instant. */
export function setSpeed(s: number): void {
  speed = s;
}
export function getSpeed(): number {
  return speed;
}

/** Waits `ms` of game time. */
export function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms / speed));
}

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inCubic: (t: number) => t ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2,
};

/** Runs fn(progress) each frame for `ms` of game time. Records frame times for the smoke test. */
export function tween(ms: number, fn: (t: number) => void, easing: (t: number) => number = ease.outCubic): Promise<void> {
  const duration = ms / speed;
  return new Promise((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      recordFrame(now);
      const t = Math.min(1, (now - start) / Math.max(1, duration));
      fn(easing(t));
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

declare global {
  interface Window {
    __frames: number[];
    __screens: string[];
    __marks: Record<string, number>;
  }
}
window.__frames = [];
window.__marks = {};
let lastFrame = -1;
/** Called by every animation loop; one entry per painted frame (loops share a timestamp). */
export function recordFrame(now: number): void {
  if (now === lastFrame) return;
  lastFrame = now;
  const frames = window.__frames;
  if (frames.length < 60000) frames.push(now);
}
/** Named timestamps for the smoke test (e.g. monster formed, bout start/end). */
export function mark(name: string): void {
  window.__marks[name] = performance.now();
}
