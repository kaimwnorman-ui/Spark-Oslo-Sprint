// The monster, drawn in code from the page's real words (SPEC §4, §6): one of five
// silhouettes, filled with the words along flow lines, so every page gets its own monster.
import type { MonsterShape } from '../../../shared/types.ts';
import { hashString, rng } from '../../../shared/random.ts';
import { reducedMotion } from './anim.ts';

/** Shapes live in a unit box 1.6 wide and 1 tall. */
const UW = 1.6;

type Pen = {
  circle(x: number, y: number, r: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot?: number): void;
  poly(points: [number, number][]): void;
  limb(points: [number, number][], width: number): void;
};

interface ShapeDef {
  draw(p: Pen): void;
  eyes: [number, number][];
  eyeR: number;
  /** Flow direction (radians) at a unit point, for laying words along the body. */
  flow(x: number, y: number): number;
  /** Extra details drawn in ink over the words (mouth, pincer notches...). */
  details?(g: CanvasRenderingContext2D, u: (x: number, y: number) => [number, number], s: number, color: string): void;
}

const serpentSpine = (u: number): [number, number] => [0.08 + 1.1 * u, 0.74 + 0.11 * Math.sin(u * 2.2 * Math.PI) - 0.36 * u ** 4];
const [SHX, SHY] = (() => {
  const [x, y] = serpentSpine(1);
  return [x + 0.09, y - 0.05];
})();

const SHAPES: Record<MonsterShape, ShapeDef> = {
  serpent: {
    draw(p) {
      for (let k = 0; k <= 120; k++) {
        const u = k / 120;
        const [x, y] = serpentSpine(u);
        p.circle(x, y, 0.02 + 0.1 * Math.sin(Math.min(1, u * 1.05) * Math.PI * 0.82));
      }
      p.ellipse(SHX, SHY, 0.16, 0.115, -0.25);
      p.poly([[SHX + 0.06, SHY + 0.02], [SHX + 0.27, SHY + 0.0], [SHX + 0.1, SHY + 0.11]]);
    },
    eyes: [[SHX - 0.03, SHY - 0.05], [SHX + 0.06, SHY - 0.07]],
    eyeR: 0.03,
    flow: (x) => {
      const u = Math.min(1, Math.max(0, (x - 0.08) / 1.1));
      return Math.atan((0.11 * 2.2 * Math.PI * Math.cos(u * 2.2 * Math.PI) - 1.44 * u ** 3) / 1.1);
    },
    details(g, u, s) {
      const [mx, my] = u(SHX + 0.06, SHY + 0.05);
      g.strokeStyle = '#0d0b18';
      g.lineWidth = s * 0.012;
      g.beginPath();
      g.moveTo(mx - s * 0.08, my - s * 0.01);
      g.quadraticCurveTo(mx, my + s * 0.03, mx + s * 0.1, my + s * 0.02);
      g.stroke();
      g.fillStyle = '#fff';
      for (const fx of [0.01, 0.09]) {
        const [fx0, fy0] = u(SHX + fx, SHY + 0.055);
        g.beginPath();
        g.moveTo(fx0 - s * 0.012, fy0);
        g.lineTo(fx0, fy0 + s * 0.045);
        g.lineTo(fx0 + s * 0.012, fy0);
        g.fill();
      }
    },
  },
  golem: {
    draw(p) {
      p.poly([[0.5, 0.3], [1.1, 0.3], [1.14, 0.8], [0.46, 0.8]]);
      p.ellipse(0.8, 0.3, 0.32, 0.1);
      p.poly([[0.66, 0.06], [0.94, 0.06], [0.97, 0.3], [0.63, 0.3]]);
      p.limb([[0.52, 0.38], [0.34, 0.56], [0.3, 0.72]], 0.13);
      p.limb([[1.08, 0.38], [1.26, 0.56], [1.3, 0.72]], 0.13);
      p.circle(0.3, 0.76, 0.09);
      p.circle(1.3, 0.76, 0.09);
      p.poly([[0.54, 0.78], [0.72, 0.78], [0.72, 0.98], [0.52, 0.98]]);
      p.poly([[0.88, 0.78], [1.06, 0.78], [1.08, 0.98], [0.88, 0.98]]);
    },
    eyes: [[0.73, 0.16], [0.87, 0.16]],
    eyeR: 0.03,
    flow: (x, y) => 0.08 * Math.sin(x * 9 + y * 4),
    details(g, u, s) {
      const [x0, y0] = u(0.72, 0.24);
      g.strokeStyle = '#0d0b18';
      g.lineWidth = s * 0.014;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + s * 0.16, y0);
      g.stroke();
    },
  },
  bird: {
    draw(p) {
      p.ellipse(0.78, 0.6, 0.3, 0.19, -0.1);
      p.circle(1.07, 0.4, 0.12);
      p.poly([[1.15, 0.36], [1.36, 0.42], [1.15, 0.48]]);
      p.poly([[0.6, 0.52], [0.18, 0.06], [0.42, 0.1], [0.9, 0.46]]);
      p.poly([[0.8, 0.46], [0.86, 0.02], [1.02, 0.1], [0.98, 0.5]]);
      p.poly([[0.52, 0.6], [0.14, 0.5], [0.12, 0.8], [0.52, 0.7]]);
      p.limb([[0.74, 0.76], [0.7, 0.95]], 0.03);
      p.limb([[0.86, 0.76], [0.88, 0.95]], 0.03);
    },
    eyes: [[1.06, 0.36], [1.12, 0.37]],
    eyeR: 0.026,
    flow: (x, y) => -0.35 + 0.25 * Math.sin(x * 3) + 0.2 * (y - 0.5),
  },
  spider: {
    draw(p) {
      p.ellipse(0.6, 0.55, 0.27, 0.23);
      p.circle(0.95, 0.55, 0.14);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) {
          const ox = 0.88 + i * 0.05;
          const kneeX = 0.62 + i * 0.22;
          const footX = 0.36 + i * 0.36;
          p.limb([[ox, 0.55], [kneeX, 0.55 + side * 0.36], [footX, 0.55 + side * 0.44]], 0.04);
        }
      }
    },
    eyes: [[1.0, 0.5], [1.05, 0.56]],
    eyeR: 0.024,
    flow: (x, y) => Math.atan2(y - 0.55, x - 0.75) * 0.5,
    details(g, u, s) {
      g.fillStyle = '#fff';
      for (const [ex, ey] of [[0.97, 0.45], [1.05, 0.48]] as const) {
        const [x, y] = u(ex, ey);
        g.beginPath();
        g.arc(x, y, s * 0.012, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
  crab: {
    draw(p) {
      p.ellipse(0.8, 0.6, 0.38, 0.2);
      p.limb([[0.5, 0.52], [0.34, 0.4], [0.28, 0.3]], 0.07);
      p.limb([[1.1, 0.52], [1.26, 0.4], [1.32, 0.3]], 0.07);
      p.ellipse(0.24, 0.22, 0.12, 0.09, -0.6);
      p.ellipse(1.36, 0.22, 0.12, 0.09, 0.6);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const sx = 0.8 + side * (0.18 + i * 0.07);
          p.limb([[sx, 0.66], [sx + side * 0.22, 0.78], [sx + side * 0.3, 0.96]], 0.035);
        }
      }
      p.limb([[0.72, 0.45], [0.69, 0.27]], 0.025);
      p.limb([[0.88, 0.45], [0.91, 0.27]], 0.025);
      p.circle(0.69, 0.25, 0.04);
      p.circle(0.91, 0.25, 0.04);
    },
    eyes: [[0.69, 0.25], [0.91, 0.25]],
    eyeR: 0.026,
    flow: (x) => 0.12 * Math.sin(x * 5),
    details(g, u, s) {
      g.fillStyle = 'rgba(247,241,227,1)';
      for (const [cx, cy, rot] of [[0.16, 0.18, -0.6], [1.44, 0.18, 0.6]] as const) {
        const [x, y] = u(cx, cy);
        g.save();
        g.translate(x, y);
        g.rotate(rot);
        g.beginPath();
        g.moveTo(-s * 0.08, 0);
        g.lineTo(s * 0.02, -s * 0.025);
        g.lineTo(s * 0.02, s * 0.025);
        g.closePath();
        g.globalCompositeOperation = 'destination-out';
        g.fill();
        g.restore();
      }
    },
  },
};

export interface MonsterState {
  /** 0..1 overall visibility. */
  alpha?: number;
  /** 0..1 white flash when hit. */
  hurt?: number;
  /** Extra glow, 0..1. */
  glow?: number;
  /** 0..1: draw only the silhouette (for the reveal); 1 = full words. */
  words?: number;
  /** Shake offset in px. */
  shake?: number;
}

export interface TargetPoint {
  x: number;
  y: number;
  angle: number;
}

export class MonsterView {
  readonly canvas: HTMLCanvasElement;
  readonly color: string;
  private readonly def: ShapeDef;
  private readonly words: string[];
  private mask!: HTMLCanvasElement;
  private texture!: HTMLCanvasElement;
  private glowLayer!: HTMLCanvasElement;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private dpr = 1;
  private readonly born = performance.now();
  private readonly seed: number;

  constructor(shape: MonsterShape, words: string[], color: string, width: number, height: number) {
    this.def = SHAPES[shape] ?? SHAPES.serpent;
    this.words = words.length ? words : ['?'];
    this.color = color;
    this.seed = hashString(words.join(' ') + shape);
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'monster';
    this.resize(width, height);
  }

  /** Unit coordinates to canvas CSS pixels. */
  u = (x: number, y: number): [number, number] => [this.ox + x * this.scale, this.oy + y * this.scale];

  resize(width: number, height: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const pad = 0.06;
    this.scale = Math.min((width * (1 - 2 * pad)) / UW, height * (1 - 2 * pad));
    this.ox = (width - UW * this.scale) / 2;
    this.oy = (height - this.scale) / 2;
    this.buildLayers(width, height);
  }

  private layer(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
    const c = document.createElement('canvas');
    c.width = Math.round(width * this.dpr);
    c.height = Math.round(height * this.dpr);
    const g = c.getContext('2d')!;
    g.scale(this.dpr, this.dpr);
    return [c, g];
  }

  private buildLayers(width: number, height: number): void {
    // 1. The silhouette mask.
    const [mask, mg] = this.layer(width, height);
    mg.fillStyle = '#fff';
    mg.strokeStyle = '#fff';
    mg.lineCap = 'round';
    mg.lineJoin = 'round';
    const s = this.scale;
    const pen: Pen = {
      circle: (x, y, r) => {
        const [px, py] = this.u(x, y);
        mg.beginPath();
        mg.arc(px, py, r * s, 0, Math.PI * 2);
        mg.fill();
      },
      ellipse: (x, y, rx, ry, rot = 0) => {
        const [px, py] = this.u(x, y);
        mg.beginPath();
        mg.ellipse(px, py, rx * s, ry * s, rot, 0, Math.PI * 2);
        mg.fill();
      },
      poly: (points) => {
        mg.beginPath();
        points.forEach(([x, y], i) => {
          const [px, py] = this.u(x, y);
          if (i) mg.lineTo(px, py);
          else mg.moveTo(px, py);
        });
        mg.closePath();
        mg.fill();
      },
      limb: (points, w) => {
        mg.lineWidth = w * s;
        mg.beginPath();
        points.forEach(([x, y], i) => {
          const [px, py] = this.u(x, y);
          if (i) mg.lineTo(px, py);
          else mg.moveTo(px, py);
        });
        mg.stroke();
      },
    };
    this.def.draw(pen);
    this.mask = mask;

    // 2. The glow under the body.
    const [glow, gg] = this.layer(width, height);
    gg.shadowColor = this.color;
    gg.shadowBlur = 28;
    gg.drawImage(mask, 0, 0, width, height);
    gg.globalCompositeOperation = 'source-in';
    gg.fillStyle = this.color;
    gg.fillRect(0, 0, width, height);
    this.glowLayer = glow;

    // 3. The words, along flow lines, clipped to the silhouette.
    const [tex, tg] = this.layer(width, height);
    tg.drawImage(mask, 0, 0, width, height);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = '#16132a';
    tg.fillRect(0, 0, width, height);
    tg.globalCompositeOperation = 'source-atop';
    const shade = tg.createLinearGradient(0, this.oy, 0, this.oy + s);
    shade.addColorStop(0, this.color);
    shade.addColorStop(1, '#16132a');
    tg.fillStyle = shade;
    tg.globalAlpha = 0.45;
    tg.fillRect(0, 0, width, height);
    tg.globalAlpha = 1;
    const next = rng(this.seed);
    const base = Math.max(9, s * 0.04);
    const lineH = base * 1.12;
    let wi = 0;
    for (let y = this.oy - lineH; y < this.oy + s + lineH; y += lineH) {
      let x = this.ox - next() * 60;
      while (x < this.ox + UW * s + 20) {
        const word = this.words[wi++ % this.words.length]!;
        const size = base * (0.78 + 0.5 * next());
        tg.font = `${next() > 0.7 ? 800 : 600} ${size.toFixed(1)}px var(--font-text, system-ui), system-ui, sans-serif`;
        const w = tg.measureText(word).width;
        const ux = (x - this.ox) / s;
        const uy = (y - this.oy) / s;
        const angle = this.def.flow(ux, uy);
        tg.save();
        tg.translate(x, y);
        tg.rotate(angle);
        const tint = next();
        tg.fillStyle = tint > 0.86 ? '#fff' : tint > 0.55 ? lighten(this.color, 0.55) : lighten(this.color, 0.25);
        tg.fillText(word, 0, 0);
        tg.restore();
        x += w + size * 0.45;
      }
    }
    tg.globalCompositeOperation = 'destination-in';
    tg.drawImage(mask, 0, 0, width, height);
    tg.globalCompositeOperation = 'source-over';
    this.def.details?.(tg, this.u, s, this.color);
    this.texture = tex;
  }

  /** Points inside the silhouette (for the words to fly to). */
  targets(count: number): TargetPoint[] {
    const g = this.mask.getContext('2d')!;
    const { width, height } = this.mask;
    const data = g.getImageData(0, 0, width, height).data;
    const next = rng(this.seed ^ 0x5bd1e995);
    const out: TargetPoint[] = [];
    let guard = 0;
    while (out.length < count && guard++ < count * 400) {
      const px = Math.floor(next() * width);
      const py = Math.floor(next() * height);
      if (data[(py * width + px) * 4 + 3]! > 128) {
        const x = px / this.dpr;
        const y = py / this.dpr;
        out.push({ x, y, angle: this.def.flow((x - this.ox) / this.scale, (y - this.oy) / this.scale) });
      }
    }
    return out;
  }

  /** Where the body is roughly centred, in canvas pixels. */
  centre(): { x: number; y: number } {
    const [x, y] = this.u(UW / 2, 0.55);
    return { x, y };
  }

  draw(now: number, state: MonsterState = {}): void {
    const g = this.canvas.getContext('2d')!;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;
    const t = reducedMotion() ? 0 : (now - this.born) / 1000;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const alpha = state.alpha ?? 1;
    if (alpha <= 0) return;
    const breathe = 1 + 0.018 * Math.sin(t * 2.1);
    const shake = state.shake ?? 0;
    const c = this.centre();
    g.save();
    g.globalAlpha = alpha;
    g.translate(c.x + shake, c.y);
    g.scale(breathe, 2 - breathe);
    g.translate(-c.x, -c.y);
    g.globalAlpha = alpha * (0.55 + 0.25 * Math.sin(t * 3) + 0.4 * (state.glow ?? 0));
    g.drawImage(this.glowLayer, 0, 0, w, h);
    g.globalAlpha = alpha;
    const words = state.words ?? 1;
    if (words < 1) {
      g.globalAlpha = alpha * (1 - words);
      g.drawImage(this.glowLayer, 0, 0, w, h);
      g.drawImage(this.mask, 0, 0, w, h);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = '#0d0b18';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = alpha * words;
    }
    g.drawImage(this.texture, 0, 0, w, h);
    g.globalAlpha = alpha;
    // Eyes: glowing, blinking.
    const blink = Math.sin(t * 1.3) > 0.985;
    for (const [ex, ey] of this.def.eyes) {
      const [x, y] = this.u(ex, ey);
      const r = this.def.eyeR * this.scale;
      g.fillStyle = '#fff';
      g.shadowColor = '#ffd34d';
      g.shadowBlur = 14;
      g.beginPath();
      g.ellipse(x, y, r, blink ? r * 0.15 : r, 0, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      if (!blink) {
        g.fillStyle = '#0d0b18';
        g.beginPath();
        g.arc(x + r * 0.25, y, r * 0.5, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (state.hurt) {
      g.globalCompositeOperation = 'source-atop';
      g.globalAlpha = state.hurt * 0.85;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }
}

function lighten(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}
