// A full-screen canvas for particles: hit sparks, ink bursts and letters streaming like noodles.
import { recordFrame, reducedMotion } from './anim.ts';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  text?: string;
  spin: number;
  angle: number;
  gravity: number;
}

interface Noodle {
  text: string;
  from: { x: number; y: number };
  to: () => { x: number; y: number };
  c1: { x: number; y: number };
  start: number;
  duration: number;
  size: number;
  color: string;
  done: boolean;
}

export class Effects {
  readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private noodles: Noodle[] = [];
  private raf = 0;
  private last = performance.now();
  private readonly reduce = reducedMotion();

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'effects';
    this.g = this.canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resize);
    this.raf = requestAnimationFrame(this.frame);
  }

  private resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  sparks(x: number, y: number, color: string, count = 18, power = 1): void {
    if (this.reduce) count = Math.min(count, 6);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (2 + Math.random() * 6) * power;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0, max: 380 + Math.random() * 300, size: 3 + Math.random() * 4, color, spin: 0, angle: 0, gravity: 0.12 });
    }
  }

  inkBurst(x: number, y: number, color: string, words: string[], count = 60): void {
    if (this.reduce) count = Math.min(count, 12);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 2 + Math.random() * 7;
      const text = i % 2 === 0 ? words[i % Math.max(1, words.length)] : undefined;
      // Light inks so the burst reads on the dimmed K.O. screen as well as on paper.
      const tint = text ? (i % 3 === 0 ? '#ffffff' : '#ffd34d') : i % 5 === 0 ? '#ff7a1a' : color;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 2, life: 0, max: 900 + Math.random() * 700, size: text ? 16 + Math.random() * 12 : 6 + Math.random() * 14, color: tint, text, spin: (Math.random() - 0.5) * 0.3, angle: 0, gravity: 0.16 });
    }
  }

  /** Letters stream from `from` into a moving target like noodles. Resolves when all arrive. */
  noodlesTo(texts: { text: string; x: number; y: number }[], to: () => { x: number; y: number }, color: string, totalMs: number): Promise<void> {
    const now = performance.now();
    const spread = totalMs * 0.55;
    texts.forEach((t, i) => {
      const end = to();
      const mx = (t.x + end.x) / 2 + (Math.random() - 0.5) * 260;
      const my = Math.min(t.y, end.y) - 80 - Math.random() * 160;
      this.noodles.push({ text: t.text, from: { x: t.x, y: t.y }, to, c1: { x: mx, y: my }, start: now + (i / texts.length) * spread, duration: totalMs - spread, size: 16 + Math.random() * 8, color, done: false });
    });
    return new Promise((resolve) => setTimeout(resolve, totalMs + 60));
  }

  private frame = (now: number) => {
    recordFrame(now);
    const dt = Math.min(48, now - this.last) / 16.7;
    this.last = now;
    const g = this.g;
    g.clearRect(0, 0, innerWidth, innerHeight);
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const p of this.particles) {
      p.life += dt * 16.7;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 0.985;
      p.angle += p.spin * dt;
      const a = 1 - p.life / p.max;
      g.globalAlpha = Math.max(0, a);
      g.fillStyle = p.color;
      if (p.text) {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.angle);
        g.font = `800 ${p.size}px system-ui, sans-serif`;
        g.fillText(p.text, 0, 0);
        g.restore();
      } else {
        g.beginPath();
        g.arc(p.x, p.y, p.size * (0.4 + 0.6 * a), 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    for (const n of this.noodles) {
      if (n.done || now < n.start) continue;
      const t = Math.min(1, (now - n.start) / n.duration);
      const e = t * t * (3 - 2 * t);
      const end = n.to();
      const x = (1 - e) ** 2 * n.from.x + 2 * (1 - e) * e * n.c1.x + e * e * end.x;
      const y = (1 - e) ** 2 * n.from.y + 2 * (1 - e) * e * n.c1.y + e * e * end.y;
      g.save();
      g.translate(x, y);
      g.rotate((1 - e) * 0.6);
      g.scale(1 - 0.7 * e, 1 - 0.7 * e);
      g.fillStyle = n.color;
      g.font = `800 ${n.size}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.fillText(n.text, 0, 0);
      g.restore();
      if (t >= 1) n.done = true;
    }
    this.noodles = this.noodles.filter((n) => !n.done);
    this.raf = requestAnimationFrame(this.frame);
  };

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }
}
