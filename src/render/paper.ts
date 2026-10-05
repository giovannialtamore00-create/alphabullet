/** Procedural paper: warm off-white base, grain noise, faint fibers. Returned as a tileable canvas. */
import { Rng } from '../sim/rng';

export function paperCanvas(size = 512, seed = 7): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(seed);
  ctx.fillStyle = '#f3eee2';
  ctx.fillRect(0, 0, size, size);
  // Grain: per-pixel noise.
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * 14;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 0.9;
  }
  ctx.putImageData(img, 0, 0);
  // Soft blotches for uneven tone (drawn wrapped so the tile is seamless).
  for (let i = 0; i < 26; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const r = 30 + rng.next() * 90;
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        g.addColorStop(0, `rgba(120,100,70,${0.025 + rng.next() * 0.02})`);
        g.addColorStop(1, 'rgba(120,100,70,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
  }
  // Fibers: short faint curved hairs.
  ctx.lineCap = 'round';
  for (let i = 0; i < 140; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const len = 6 + rng.next() * 22;
    const ang = rng.next() * Math.PI * 2;
    ctx.strokeStyle = `rgba(90,80,60,${0.05 + rng.next() * 0.08})`;
    ctx.lineWidth = 0.6 + rng.next() * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(ang + 0.5) * len * 0.5,
      y + Math.sin(ang + 0.5) * len * 0.5,
      x + Math.cos(ang) * len,
      y + Math.sin(ang) * len,
    );
    ctx.stroke();
  }
  return c;
}

/** Soft radial dot (white), used for glows and ink splats via tint. */
export function softDotCanvas(size = 128): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Hard-edged inky dot with a slightly irregular rim (bullets). */
export function inkDotCanvas(size = 32, seed = 3): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(seed);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = (size / 2 - 2) * (0.88 + rng.next() * 0.12);
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.fill();
  return c;
}

/** Irregular ink splat (death effects). */
export function splatCanvas(size = 96, seed = 5): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const rng = new Rng(seed);
  ctx.fillStyle = '#fff';
  const m = size / 2;
  ctx.beginPath();
  ctx.arc(m, m, size * 0.2, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 11; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = size * (0.18 + rng.next() * 0.25);
    const r = size * (0.03 + rng.next() * 0.06);
    ctx.beginPath();
    ctx.arc(m + Math.cos(a) * d, m + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}
