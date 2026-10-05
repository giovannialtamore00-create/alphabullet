/** Letter pool (2 copies per letter), pickups, the 50% + timer refill rule, and drops on death. */
import {
  COPIES_PER_LETTER,
  DROP_SCATTER,
  GROUND_LETTERS,
  MAP_SIZE,
  PICKUP_RADIUS,
  RESPAWN_DELAY,
  RESPAWN_MIN_DIST_FROM_OLD,
  RESPAWN_THRESHOLD,
} from './config';
import { playerRadius } from './combat';
import { LETTER_KEYS } from './glyphs';
import type { LetterCopy, Player, World } from './types';

const MAP_MARGIN = 250;

export function createCopies(): LetterCopy[] {
  const out: LetterCopy[] = [];
  for (const letter of LETTER_KEYS)
    for (let k = 0; k < COPIES_PER_LETTER; k++)
      out.push({
        id: out.length,
        letter,
        xp: 0,
        upgraded: false,
        bold: false,
        state: 'pool',
        owner: null,
        x: 0,
        y: 0,
        wave: false,
        capitalTimer: 0,
        capitalCd: 0,
      });
  return out;
}

export function ownsLetter(w: World, p: Player, letter: string): boolean {
  return p.letters.some((id) => w.copies[id].letter === letter);
}

/** Random copy still in the pool, skipping letters in `exclude`. */
export function drawFromPool(w: World, exclude: Set<string> = new Set()): LetterCopy | null {
  const avail = w.copies.filter((c) => c.state === 'pool' && !exclude.has(c.letter));
  return avail.length ? w.rng.pick(avail) : null;
}

export function giveCopy(_w: World, p: Player, c: LetterCopy): void {
  c.state = 'owned';
  c.owner = p.id;
  c.wave = false;
  p.letters.push(c.id);
  if (p.active === null) p.active = c.id;
}

/**
 * Safe area for new letters: the whole current circle while the fog is waiting (spreads players out),
 * the next circle once it is about to shrink (so letters are not swallowed).
 */
function spawnCircle(w: World): { x: number; y: number; r: number } {
  const f = w.fog;
  if (f.phase === 'wait' && f.timer > 30) return { x: f.x, y: f.y, r: Math.max(0, f.r) };
  if (f.phase !== 'done' && f.toR > 100) return { x: f.toX, y: f.toY, r: f.toR };
  return { x: f.x, y: f.y, r: Math.max(0, f.r) };
}

/** Point inside the safe circle and the map that is as far as possible from `avoid` (up to `minDist`). */
export function findSpot(w: World, avoid: { x: number; y: number; d: number }[]): { x: number; y: number } {
  const c = spawnCircle(w);
  let best = { x: w.fog.x, y: w.fog.y }; // fog center is always safe
  let bestScore = -Infinity;
  for (let i = 0; i < 40; i++) {
    const ang = w.rng.next() * Math.PI * 2;
    const rad = Math.sqrt(w.rng.next()) * c.r * 0.9;
    const x = Math.min(MAP_SIZE - MAP_MARGIN, Math.max(MAP_MARGIN, c.x + Math.cos(ang) * rad));
    const y = Math.min(MAP_SIZE - MAP_MARGIN, Math.max(MAP_MARGIN, c.y + Math.sin(ang) * rad));
    if (Math.hypot(x - w.fog.x, y - w.fog.y) > w.fog.r) continue; // never inside the fog
    let score = Infinity;
    for (const a of avoid) score = Math.min(score, Math.hypot(a.x - x, a.y - y) - a.d);
    if (score >= 0) return { x, y };
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

export function waveCount(w: World): number {
  return w.copies.filter((c) => c.state === 'ground' && c.wave).length;
}

/** Place wave letters until the map holds GROUND_LETTERS, avoiding old spots. Returns how many spawned. */
export function spawnWave(w: World): number {
  const avoid: { x: number; y: number; d: number }[] = [
    ...w.wave.spots.map((s) => ({ ...s, d: RESPAWN_MIN_DIST_FROM_OLD })),
    ...w.copies.filter((c) => c.state === 'ground').map((c) => ({ x: c.x, y: c.y, d: 500 })),
    ...w.players.filter((p) => p.alive).map((p) => ({ x: p.x, y: p.y, d: 350 })),
  ];
  const spots: { x: number; y: number }[] = [];
  let n = 0;
  while (waveCount(w) < GROUND_LETTERS) {
    const c = drawFromPool(w);
    if (!c) break;
    const s = findSpot(w, avoid);
    c.state = 'ground';
    c.wave = true;
    c.x = s.x;
    c.y = s.y;
    avoid.push({ ...s, d: 500 });
    spots.push(s);
    n++;
  }
  if (n) w.wave.spots = spots;
  return n;
}

export function updatePickups(w: World): void {
  for (const p of w.players) {
    if (!p.alive) continue;
    const reach = PICKUP_RADIUS + playerRadius(w, p);
    for (const c of w.copies) {
      if (c.state !== 'ground') continue;
      if (Math.abs(c.x - p.x) > reach || Math.abs(c.y - p.y) > reach) continue;
      if (Math.hypot(c.x - p.x, c.y - p.y) > reach) continue;
      if (ownsLetter(w, p, c.letter)) continue; // no duplicates: walking over it does nothing
      giveCopy(w, p, c);
      p.lettersCollected++;
      w.events.push({ t: 'pickup', id: p.id, letter: c.letter, x: c.x, y: c.y });
    }
  }
}

/** Once half the map letters are taken, start the refill timer; refill when it ends. */
export function updateWave(w: World, dt: number): void {
  if (w.wave.timer === null) {
    const poolLeft = w.copies.some((c) => c.state === 'pool');
    if (poolLeft && waveCount(w) <= RESPAWN_THRESHOLD) w.wave.timer = RESPAWN_DELAY;
    return;
  }
  w.wave.timer -= dt;
  if (w.wave.timer <= 0) {
    w.wave.timer = null;
    if (spawnWave(w) > 0) w.events.push({ t: 'letterWave' });
  }
}

/** All owned letters scatter near the player as normal pickups, keeping XP/upgrade state. */
export function dropLetters(w: World, p: Player): void {
  for (const id of p.letters) {
    const c = w.copies[id];
    const ang = w.rng.next() * Math.PI * 2;
    const rad = 30 + w.rng.next() * DROP_SCATTER;
    c.state = 'ground';
    c.owner = null;
    c.wave = false;
    c.capitalTimer = 0;
    c.x = Math.min(MAP_SIZE - 40, Math.max(40, p.x + Math.cos(ang) * rad));
    c.y = Math.min(MAP_SIZE - 40, Math.max(40, p.y + Math.sin(ang) * rad));
  }
  p.letters = [];
  p.active = null;
}
