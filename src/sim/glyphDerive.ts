/**
 * Derives gameplay from glyph strokes: emitters (free stroke ends + direction), shields,
 * collision radius and bullet stats. Nothing here is hand-coded per letter.
 */
import { BULLET, CAP_SIZE, LOWER_SIZE, SHIELD } from './config';
import { LETTERS, type GlyphForm, type Pt, type ShieldArc, type Stroke } from './glyphs';

export interface Emitter {
  x: number; // unit coords
  y: number;
  dx: number; // unit direction, snapped to 8 ways
  dy: number;
  /** Stroke length (unit) from this free end to the nearest joint: longer arm = longer range. */
  arm: number;
  /** Bullet range in px, proportional to arm. */
  range: number;
  /** Damage multiplier on this emitter's share: shorter range = more damage. */
  dmgMul: number;
  /** Bullets per volley; >1 = shotgun burst spread over BULLET.dotSpreadDeg, damage split between them. */
  pellets: number;
}
export interface BulletStats {
  rate: number; // volleys per second (all emitters fire together)
  dmg: number; // per bullet, before the emitter's dmgMul / pellets split
  speed: number;
  radius: number;
  life: number;
}
export interface DerivedForm {
  letter: string;
  capital: boolean;
  glyph: GlyphForm;
  size: number; // px per unit
  emitters: Emitter[];
  emittersFromShield: boolean;
  shields: ShieldArc[];
  shieldCoverage: number; // 0..1
  shieldCap: number; // damage/sec blocked
  radius: number; // px
  bullet: BulletStats;
}

const CONNECT_EPS = 0.045;
const NEAR_END_SKIP = 0.12; // arc length near an end ignored when testing self-contact
const BLOCK_RANGE = 0.22;
const BLOCK_EPS = 0.035;

function distPointSeg(p: Pt, a: Pt, b: Pt): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 0 ? ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/** Segments of all strokes, excluding the part of `own` stroke within NEAR_END_SKIP of its `end`. */
function otherSegments(strokes: Stroke[], own: number, end: 0 | 1): [Pt, Pt][] {
  const segs: [Pt, Pt][] = [];
  strokes.forEach((s, si) => {
    const pts = s.pts;
    if (si !== own) {
      for (let k = 0; k < pts.length - 1; k++) segs.push([pts[k], pts[k + 1]]);
      return;
    }
    const order = end === 0 ? pts : [...pts].reverse();
    let walked = 0;
    for (let k = 0; k < order.length - 1; k++) {
      const segLen = Math.hypot(order[k + 1].x - order[k].x, order[k + 1].y - order[k].y);
      if (walked >= NEAR_END_SKIP) segs.push([order[k], order[k + 1]]);
      walked += segLen;
    }
  });
  return segs;
}

function snap8(dx: number, dy: number): [number, number] {
  const step = Math.PI / 4;
  const ang = Math.round(Math.atan2(dy, dx) / step) * step;
  const sx = Math.abs(Math.cos(ang)) < 1e-9 ? 0 : Math.cos(ang);
  const sy = Math.abs(Math.sin(ang)) < 1e-9 ? 0 : Math.sin(ang);
  return [sx, sy];
}

function norm(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/** Points every ~0.02 unit along a polyline, starting at the given end, with walked distance. */
function walk(pts: Pt[], end: 0 | 1): { p: Pt; d: number }[] {
  const order = end === 0 ? pts : [...pts].reverse();
  const out: { p: Pt; d: number }[] = [{ p: order[0], d: 0 }];
  let d = 0;
  for (let k = 0; k < order.length - 1; k++) {
    const a = order[k], b = order[k + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / 0.02));
    for (let i = 1; i <= n; i++) out.push({ p: { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, d: d + (len * i) / n });
    d += len;
  }
  return out;
}

/**
 * Arm length of a free end: distance along its stroke to the first joint with another stroke
 * (or with a far part of itself). With no joint, half the stroke if the other end is free too.
 */
export function armLength(strokes: Stroke[], si: number, end: 0 | 1): number {
  const s = strokes[si];
  const samples = walk(s.pts, end);
  const total = samples[samples.length - 1].d;
  const others: [Pt, Pt][] = [];
  strokes.forEach((o, oi) => {
    if (oi !== si) for (let k = 0; k < o.pts.length - 1; k++) others.push([o.pts[k], o.pts[k + 1]]);
  });
  for (const { p, d } of samples) {
    if (d < 0.03) continue;
    if (others.some(([a, b]) => distPointSeg(p, a, b) < CONNECT_EPS)) return d;
    // Self-joint: a part of the same stroke far (along the stroke) from here passes close by.
    if (samples.some((q) => Math.abs(q.d - d) > 0.15 && Math.hypot(q.p.x - p.x, q.p.y - p.y) < CONNECT_EPS * 0.6)) return d;
  }
  const otherEnd = samples[samples.length - 1].p;
  const otherEndJoined = others.some(([a, b]) => distPointSeg(otherEnd, a, b) < CONNECT_EPS);
  return otherEndJoined ? total : total / 2;
}

/** Free stroke ends that are not touching other strokes and not firing straight into their own glyph. */
export function deriveEmitters(strokes: Stroke[]): Emitter[] {
  const out: Emitter[] = [];
  strokes.forEach((s, si) => {
    const pts = s.pts;
    if (pts.length < 2) return;
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(first.x - last.x, first.y - last.y) < CONNECT_EPS) return; // closed loop
    for (const end of [0, 1] as const) {
      const p = end === 0 ? first : last;
      const prev = end === 0 ? pts[1] : pts[pts.length - 2];
      const segs = otherSegments(strokes, si, end);
      if (segs.some(([a, b]) => distPointSeg(p, a, b) < CONNECT_EPS)) continue;
      let [dx, dy] = norm(p.x - prev.x, p.y - prev.y);
      const arc = end === 0 ? s.startArc : s.endArc;
      if (arc) {
        // Arc terminals point halfway between the tangent and outward radial direction.
        const [rx, ry] = norm(p.x - arc.x, p.y - arc.y);
        [dx, dy] = norm(dx + rx, dy + ry);
      }
      [dx, dy] = snap8(dx, dy);
      let blocked = false;
      for (let t = 0.04; t <= BLOCK_RANGE + 1e-9 && !blocked; t += 0.02) {
        const q = { x: p.x + dx * t, y: p.y + dy * t };
        blocked = segs.some(([a, b]) => distPointSeg(q, a, b) < BLOCK_EPS);
      }
      if (blocked) continue;
      const dup = out.some((e) => Math.hypot(e.x - p.x, e.y - p.y) < 0.05 && e.dx === dx && e.dy === dy);
      if (!dup) out.push({ x: p.x, y: p.y, dx, dy, arm: armLength(strokes, si, end), range: 0, dmgMul: 1, pellets: 1 });
    }
  });
  return out;
}

/** Weak pulses from shield curvature, used when a shield glyph has no free stroke ends. */
export function emittersFromShields(shields: ShieldArc[]): Emitter[] {
  const out: Emitter[] = [];
  for (const s of shields) {
    const facings = s.width >= 300 ? [0, 90, 180, 270] : [s.facing];
    for (const f of facings) {
      const [dx, dy] = snap8(Math.cos((f * Math.PI) / 180), Math.sin((f * Math.PI) / 180));
      // Pulses reach as far as half the curve they come from.
      const arm = (s.r * Math.min(s.width, 90) * Math.PI) / 180;
      out.push({ x: s.cx + s.r * dx, y: s.cy + s.r * dy, dx, dy, arm, range: 0, dmgMul: 1, pellets: 1 });
    }
  }
  return out;
}

export function shieldCoverage(shields: ShieldArc[]): number {
  if (!shields.length) return 0;
  let covered = 0;
  for (let deg = 0; deg < 360; deg++) if (shields.some((s) => angleInArc(deg, s))) covered++;
  return covered / 360;
}

export function angleInArc(deg: number, s: ShieldArc): boolean {
  if (s.width >= 360) return true;
  const diff = Math.abs((((deg - s.facing) % 360) + 540) % 360 - 180);
  return diff <= s.width / 2 + 1e-9;
}

export function deriveForm(letter: string, glyph: GlyphForm, capital: boolean): DerivedForm {
  const size = capital ? CAP_SIZE : LOWER_SIZE;
  let emitters = deriveEmitters(glyph.strokes);
  let emittersFromShield = false;
  if (!emitters.length && glyph.shields.length) {
    emitters = emittersFromShields(glyph.shields);
    emittersFromShield = true;
  }
  const rangeMul = capital ? BULLET.capitalRangeMul : 1;
  for (const e of emitters) {
    const base = Math.min(BULLET.maxRange, Math.max(BULLET.minRange, e.arm * BULLET.rangePerUnit));
    e.range = base * rangeMul;
    if (e.arm <= BULLET.dotMaxArm) {
      e.dmgMul = BULLET.dotDmgMul;
      e.pellets = BULLET.dotPellets;
    } else {
      e.dmgMul = 1 + (BULLET.shortRangeBonus * (BULLET.maxRange - base)) / (BULLET.maxRange - BULLET.minRange);
    }
  }
  const n = Math.max(1, emitters.length);
  const isShield = glyph.shields.length > 0;
  const rate = BULLET.baseRate / Math.sqrt(n);
  const totalDps =
    BULLET.baseDps *
    (1 + BULLET.perExtraEmitterDps * (n - 1)) *
    (isShield ? BULLET.shieldLetterDpsMul : 1) *
    (capital ? BULLET.capitalDpsMul : 1);
  const coverage = shieldCoverage(glyph.shields);
  const shieldCap = isShield
    ? SHIELD.baseCap * (1 - SHIELD.coverageFalloff * coverage) * (capital ? SHIELD.capitalMul : 1)
    : 0;
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const s of glyph.strokes)
    for (const p of s.pts) {
      minx = Math.min(minx, p.x);
      maxx = Math.max(maxx, p.x);
      miny = Math.min(miny, p.y);
      maxy = Math.max(maxy, p.y);
    }
  const radius = Math.max(0.35, (maxx - minx + (maxy - miny)) / 4) * size;
  return {
    letter,
    capital,
    glyph,
    size,
    emitters,
    emittersFromShield,
    shields: glyph.shields,
    shieldCoverage: coverage,
    shieldCap,
    radius,
    bullet: {
      rate,
      dmg: totalDps / (n * rate),
      speed: BULLET.speed * (capital ? BULLET.capitalSpeedMul : 1),
      radius: BULLET.radius * (capital ? BULLET.capitalRadiusMul : 1),
      life: BULLET.life,
    },
  };
}

const cache = new Map<string, DerivedForm>();
export function getForm(letter: string, capital: boolean): DerivedForm {
  const key = letter + (capital ? '!' : '');
  let f = cache.get(key);
  if (!f) {
    const g = LETTERS[letter];
    if (!g) throw new Error(`Unknown letter ${letter}`);
    f = deriveForm(letter, capital ? g.upper : g.lower, capital);
    cache.set(key, f);
  }
  return f;
}

/** True if damage arriving from `angleDeg` (direction from player to source) hits a shield arc. */
export function shieldCovers(form: DerivedForm, angleDeg: number): boolean {
  return form.shields.some((s) => angleInArc(angleDeg, s));
}

/** Compact direction label for docs/debug, e.g. "S", "NE". */
export function dirLabel(dx: number, dy: number): string {
  const v = (dy < -0.1 ? 'N' : dy > 0.1 ? 'S' : '') + (dx > 0.1 ? 'E' : dx < -0.1 ? 'W' : '');
  return v || '?';
}
