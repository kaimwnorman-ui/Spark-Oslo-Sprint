// Blot, drawn in code (SPEC §4): an ink blot with 2 eyes, 1 mouth and a drip, deformed per pose.
// Traits attach as extra paths in the monster's ink colour.
import type { Trait } from '../../../shared/types.ts';
import { svgEl } from './dom.ts';
import { reducedMotion, recordFrame } from './anim.ts';

export type Pose = 'idle' | 'listening' | 'confused' | 'excited' | 'attacking' | 'hurt' | 'eating' | 'proud';

const CX = 100;
const CY = 108;
const R = 66;
const POINTS = 28;

interface PoseShape {
  sx: number; // squash/stretch
  sy: number;
  tilt: number; // degrees
  wobble: number; // outline wobble amount
  eye: 'open' | 'big' | 'squint' | 'happy' | 'x' | 'star';
  mouth: 'smile' | 'o' | 'squiggle' | 'open' | 'grit' | 'wavy' | 'gape' | 'grin';
}

const POSES: Record<Pose, PoseShape> = {
  idle: { sx: 1, sy: 1, tilt: 0, wobble: 1, eye: 'open', mouth: 'smile' },
  listening: { sx: 0.97, sy: 1.04, tilt: -6, wobble: 0.7, eye: 'big', mouth: 'o' },
  confused: { sx: 1.03, sy: 0.98, tilt: 8, wobble: 1.4, eye: 'squint', mouth: 'squiggle' },
  excited: { sx: 0.96, sy: 1.07, tilt: 0, wobble: 1.6, eye: 'star', mouth: 'open' },
  attacking: { sx: 1.12, sy: 0.92, tilt: -10, wobble: 1.2, eye: 'open', mouth: 'grit' },
  hurt: { sx: 1.14, sy: 0.84, tilt: 10, wobble: 2.2, eye: 'x', mouth: 'wavy' },
  eating: { sx: 1.06, sy: 1.02, tilt: 0, wobble: 1.3, eye: 'happy', mouth: 'gape' },
  proud: { sx: 0.95, sy: 1.08, tilt: -4, wobble: 0.8, eye: 'happy', mouth: 'grin' },
};

export interface BlotView {
  el: HTMLElement;
  setPose(pose: Pose, holdMs?: number): void;
  readonly pose: Pose;
  setTraits(traits: Trait[]): void;
  /** Where the mouth is, in page pixels (for the eating set piece). */
  mouthPoint(): { x: number; y: number };
  destroy(): void;
}

function smoothPath(pts: [number, number][]): string {
  // Closed Catmull-Rom spline through the points, as cubic Béziers.
  const n = pts.length;
  let d = `M${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const p3 = pts[(i + 2) % n]!;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

function bodyRadius(theta: number, t: number, wobble: number): number {
  return (
    R *
    (1 +
      wobble * (0.035 * Math.sin(3 * theta + t * 1.7) + 0.025 * Math.sin(5 * theta - t * 1.1) + 0.015 * Math.sin(7 * theta + t * 2.3)))
  );
}

const TRAIT_SHAPES: Record<Trait['kind'], string> = {
  horn: 'M -13 2 Q -9 -30 6 -52 Q 3 -24 13 2 Z',
  fin: 'M -24 2 Q -12 -40 20 -50 Q 10 -22 24 2 Z',
  tail: 'M -9 0 Q -36 26 -14 58 Q 4 76 30 62 Q 10 62 2 46 Q -12 24 9 0 Z',
  spikes: 'M -28 2 L -19 -20 L -10 2 L 0 -26 L 10 2 L 19 -20 L 28 2 Z',
};

/** Anchor angles (degrees, 0 = right, -90 = top) per kind, used in order as traits repeat. */
const ANCHORS: Record<Trait['kind'], number[]> = {
  horn: [-112, -68, -90],
  spikes: [-90, -128, -52],
  fin: [190, -10, 160],
  tail: [140, 40, 160],
};

export function createBlot(size = 220): BlotView {
  const el = document.createElement('div');
  el.className = 'blot';
  el.style.width = `${size}px`;
  el.style.height = `${(size * 230) / 200}px`;
  const svg = svgEl('svg', { viewBox: '0 0 200 230', role: 'img', 'aria-label': 'Blot, a small ink creature' });
  const traitsBack = svgEl('g', { class: 'traits-back' });
  const body = svgEl('path', { class: 'blot-body' });
  const drip = svgEl('path', { class: 'blot-body' });
  const shine = svgEl('ellipse', { cx: 76, cy: 76, rx: 18, ry: 10, fill: '#fff', opacity: 0.18, transform: 'rotate(-30 76 76)' });
  const face = svgEl('g');
  const traitsFront = svgEl('g', { class: 'traits-front' });
  const rig = svgEl('g');
  rig.append(traitsBack, drip, body, shine, face, traitsFront);
  svg.append(rig);
  el.append(svg);

  let pose: Pose = 'idle';
  let poseUntil = 0;
  let resting: Pose = 'idle';
  let traits: Trait[] = [];
  let raf = 0;
  const reduce = reducedMotion();
  const born = performance.now();

  function eye(x: number, y: number, kind: PoseShape['eye'], t: number, left: boolean): string {
    const blink = !reduce && Math.sin(t * 0.9 + (left ? 0 : 0.2)) > 0.995;
    switch (kind) {
      case 'happy':
        return `<path d="M${x - 11} ${y + 3} Q${x} ${y - 10} ${x + 11} ${y + 3}" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>`;
      case 'x':
        return `<path d="M${x - 9} ${y - 9} L${x + 9} ${y + 9} M${x + 9} ${y - 9} L${x - 9} ${y + 9}" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`;
      case 'squint': {
        const ry = left ? 16 : 8;
        return `<ellipse cx="${x}" cy="${y}" rx="13" ry="${ry}" fill="#fff"/><circle cx="${x + 2}" cy="${y + 1}" r="6" fill="#1d1a2f"/>` +
          (left ? '' : `<path d="M${x - 14} ${y - 16} L${x + 12} ${y - 22}" stroke="#fff" stroke-width="4" stroke-linecap="round"/>`);
      }
      default: {
        const big = kind === 'big' || kind === 'star';
        const ry = blink ? 2 : big ? 19 : 16;
        const look = Math.sin(t * 0.5) * 2;
        const pupil = blink ? '' : `<circle cx="${x + look}" cy="${y + (kind === 'big' ? -3 : 2)}" r="${big ? 8 : 7}" fill="#1d1a2f"/><circle cx="${x + look + 3}" cy="${y - 2}" r="2.5" fill="#fff"/>`;
        const star = kind === 'star' && !blink ? `<path d="M${x + 9} ${y - 18} l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#ffd34d"/>` : '';
        return `<ellipse cx="${x}" cy="${y}" rx="${big ? 15 : 13}" ry="${ry}" fill="#fff"/>${pupil}${star}`;
      }
    }
  }

  function mouth(kind: PoseShape['mouth'], t: number): string {
    const x = CX;
    const y = 134;
    switch (kind) {
      case 'o':
        return `<ellipse cx="${x}" cy="${y}" rx="7" ry="9" fill="#0d0b18" stroke="#fff" stroke-width="2"/>`;
      case 'squiggle':
        return `<path d="M${x - 16} ${y} q6 -6 11 0 t11 0 t11 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      case 'open':
        return `<path d="M${x - 18} ${y - 4} Q${x} ${y + 26} ${x + 18} ${y - 4} Z" fill="#0d0b18" stroke="#fff" stroke-width="3"/><path d="M${x - 8} ${y + 9} Q${x} ${y + 3} ${x + 8} ${y + 9}" fill="#ff6f7d"/>`;
      case 'grit':
        return `<rect x="${x - 18}" y="${y - 6}" width="36" height="13" rx="4" fill="#fff"/><path d="M${x - 6} ${y - 6} v13 M${x + 6} ${y - 6} v13" stroke="#1d1a2f" stroke-width="2"/>`;
      case 'wavy':
        return `<path d="M${x - 18} ${y + 4} q4.5 -8 9 0 t9 0 t9 0 t9 0" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>`;
      case 'gape': {
        const open = 18 + 6 * Math.sin(t * 9);
        return `<ellipse cx="${x}" cy="${y + 4}" rx="24" ry="${open}" fill="#0d0b18" stroke="#fff" stroke-width="3"/><ellipse cx="${x}" cy="${y + 4 + open * 0.55}" rx="12" ry="${open * 0.3}" fill="#ff6f7d"/>`;
      }
      case 'grin':
        return `<path d="M${x - 22} ${y - 6} Q${x} ${y + 20} ${x + 22} ${y - 6}" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>`;
      default:
        return `<path d="M${x - 14} ${y - 2} Q${x} ${y + 10} ${x + 14} ${y - 2}" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    }
  }

  function renderTraits(): void {
    const counts: Record<string, number> = {};
    let back = '';
    let front = '';
    traits.forEach((trait, i) => {
      const n = (counts[trait.kind] = (counts[trait.kind] ?? 0) + 1) - 1;
      const angles = ANCHORS[trait.kind];
      const deg = angles[n % angles.length]! + (n >= angles.length ? 12 * n : 0);
      const a = (deg * Math.PI) / 180;
      const ax = CX + (R - 6) * Math.cos(a);
      const ay = CY + (R - 6) * Math.sin(a);
      const rot = deg + 90;
      const wobbly = trait.look === 'wobbly';
      const shining = trait.look === 'shining';
      const skew = wobbly ? ' skewX(-12)' : '';
      const glow = shining ? ` filter="url(#trait-glow)"` : '';
      const opacity = wobbly ? 0.78 : 1;
      const label = `<text class="trait-word" x="0" y="-14" text-anchor="middle" transform="rotate(${-rot})">${escapeXml(trait.word)}</text>`;
      const g = `<g class="trait trait-${trait.look}" data-kind="${trait.kind}" transform="translate(${ax.toFixed(1)} ${ay.toFixed(1)}) rotate(${rot})${skew}" opacity="${opacity}">
        <path d="${TRAIT_SHAPES[trait.kind]}" fill="${trait.color}" stroke="#0d0b18" stroke-width="2.5"${glow}/>
        ${shining ? '<circle cx="4" cy="-30" r="3" fill="#fff" class="sparkle"/>' : ''}
        ${i === traits.length - 1 ? label : ''}
      </g>`;
      if (trait.kind === 'tail' || trait.kind === 'fin') back += g;
      else front += g;
    });
    traitsBack.innerHTML = back;
    traitsFront.innerHTML = front;
  }

  function frame(now: number): void {
    recordFrame(now);
    if (now > poseUntil && pose !== resting) pose = resting;
    const shape = POSES[pose];
    const t = reduce ? 0 : (now - born) / 1000;
    const pts: [number, number][] = [];
    for (let i = 0; i < POINTS; i++) {
      const theta = (i / POINTS) * Math.PI * 2 - Math.PI / 2;
      const r = bodyRadius(theta, t, shape.wobble);
      pts.push([CX + r * Math.cos(theta) * shape.sx, CY + r * Math.sin(theta) * shape.sy]);
    }
    body.setAttribute('d', smoothPath(pts));
    const dripLen = 26 + (reduce ? 0 : 5 * Math.sin(t * 1.3));
    const dx = CX + 30 * shape.sx;
    const dy = CY + 56 * shape.sy;
    drip.setAttribute(
      'd',
      `M${dx - 9} ${dy - 8} Q${dx - 6} ${dy + dripLen * 0.6} ${dx - 1} ${dy + dripLen} a7 7 0 1 0 6 -1 Q${dx + 6} ${dy + dripLen * 0.4} ${dx + 9} ${dy - 10} Z`,
    );
    face.innerHTML =
      eye(CX - 22, 98, shape.eye, t, true) + eye(CX + 22, 98, shape.eye, t, false) + mouth(shape.mouth, t);
    const bob = reduce ? 0 : pose === 'excited' ? Math.abs(Math.sin(t * 8)) * -8 : Math.sin(t * 2) * 2;
    const shake = !reduce && pose === 'hurt' ? Math.sin(t * 60) * 3 : 0;
    rig.setAttribute('transform', `translate(${shake} ${bob}) rotate(${shape.tilt} ${CX} ${CY + 40})`);
    raf = requestAnimationFrame(frame);
  }

  // Glow filter for shining traits.
  const defs = svgEl('defs');
  defs.innerHTML = `<filter id="trait-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  svg.prepend(defs);
  raf = requestAnimationFrame(frame);

  return {
    el,
    get pose() {
      return pose;
    },
    setPose(next: Pose, holdMs?: number) {
      if (holdMs) {
        pose = next;
        poseUntil = performance.now() + holdMs;
      } else {
        resting = next;
        pose = next;
        poseUntil = 0;
      }
      el.dataset.pose = pose;
    },
    setTraits(next: Trait[]) {
      traits = next;
      renderTraits();
    },
    mouthPoint() {
      const box = svg.getBoundingClientRect();
      return { x: box.left + (CX / 200) * box.width, y: box.top + (138 / 230) * box.height };
    },
    destroy() {
      cancelAnimationFrame(raf);
    },
  };
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
