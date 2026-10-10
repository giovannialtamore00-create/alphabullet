/** Letter pool (2 copies per letter), pickups, the 50% + timer refill rule, and drops on death. */
import {
  COPIES_PER_LETTER,
  DROP_DECAY,
  DROP_SCATTER,
  GROUND_LETTERS,
  LETTER_SPAWN,
  MAGNET,
  DT,
  MAP_SIZE,
  PICKUP_RADIUS,
  PLAYER_HP,
  RESPAWN_MIN_DIST_FROM_OLD,
  VOWELS,
  VOWEL_COPIES,
  VOWEL_WEIGHT,
  UNDERUSED_WEIGHT,
  OWNED_PENALTY,
} from './config';
import { copyMaxHp, playerRadius } from './combat';
import { LETTER_KEYS } from './glyphs';
import { WORDS } from './words';
import type { LetterCopy, Player, World } from './types';

const MAP_MARGIN = 250;

export function createCopies(): LetterCopy[] {
  const out: LetterCopy[] = [];
  for (const letter of LETTER_KEYS)
    for (let k = 0; k < (VOWELS.includes(letter) ? VOWEL_COPIES : COPIES_PER_LETTER); k++)
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
        idle: 0,
        capitalTimer: 0,
        capitalCd: 0,
        hp: PLAYER_HP,
      });
  return out;
}

export function ownsLetter(w: World, p: Player, letter: string): boolean {
  return p.letters.some((id) => w.copies[id].letter === letter);
}

let underused: Set<string> | null = null;
/** Consonants that appear in at most one word power (computed lazily: words.ts imports this module). */
function underusedConsonants(): Set<string> {
  if (!underused) {
    const count = new Map<string, number>();
    for (const d of WORDS) for (const ch of new Set(d.word)) count.set(ch, (count.get(ch) ?? 0) + 1);
    underused = new Set([...'BCDFGHJKLMNPQRSTVWXYZ'].filter((ch) => (count.get(ch) ?? 0) <= 1));
  }
  return underused;
}

/** Random copy still in the pool, skipping letters in `exclude`. */
export function drawFromPool(w: World, exclude: Set<string> = new Set()): LetterCopy | null {
  const avail = w.copies.filter((c) => c.state === 'pool' && !exclude.has(c.letter));
  if (!avail.length) return null;
  // Vowels are 15% more likely; letters nobody (or few) own come first; consonants rarely used by words are 15% rarer.
  const owned = new Map<string, number>();
  for (const c of w.copies) if (c.state === 'owned') owned.set(c.letter, (owned.get(c.letter) ?? 0) + 1);
  const wt = (c: LetterCopy) =>
    (VOWELS.includes(c.letter) ? VOWEL_WEIGHT : 1) *
    (underusedConsonants().has(c.letter) ? UNDERUSED_WEIGHT : 1) /
    (1 + OWNED_PENALTY * (owned.get(c.letter) ?? 0));
  let roll = w.rng.next() * avail.reduce((a, c) => a + wt(c), 0);
  for (const c of avail) {
    roll -= wt(c);
    if (roll < 0) return c;
  }
  return avail[avail.length - 1];
}

export function giveCopy(_w: World, p: Player, c: LetterCopy): void {
  c.state = 'owned';
  c.owner = p.id;
  c.wave = false;
  p.letters.push(c.id);
  if (p.active === null) {
    p.active = c.id;
    p.hp = c.hp;
    p.maxHp = copyMaxHp(c);
  }
}

/**
 * Safe area for new letters: the whole current circle while the fog is waiting (spreads players out),
 * the next circle once it is about to shrink (so letters are not swallowed).
 */
function spawnCircle(w: World): { x: number; y: number; r: number } {
  const f = w.fog;
  if (f.phase === 'wait' && f.timer > 30) return { x: f.x, y: f.y, r: Math.max(0, f.r) };
  if (f.phase === 'shrink') return { x: f.toX, y: f.toY, r: f.toR }; // fog moving: only the final safe circle
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

export function groundCount(w: World): number {
  return w.copies.filter((c) => c.state === 'ground').length;
}

/** Place pool letters (at most `max`) until `target` letters lie on the ground, avoiding old spots. Returns how many spawned. */
export function spawnWave(w: World, target = GROUND_LETTERS, max = Infinity): number {
  const avoid: { x: number; y: number; d: number }[] = [
    ...w.wave.spots.map((s) => ({ ...s, d: RESPAWN_MIN_DIST_FROM_OLD })),
    ...w.copies.filter((c) => c.state === 'ground').map((c) => ({ x: c.x, y: c.y, d: 500 })),
    ...w.players.filter((p) => p.alive).map((p) => ({ x: p.x, y: p.y, d: 350 })),
  ];
  const spots: { x: number; y: number }[] = [];
  let n = 0;
  while (groundCount(w) < target && n < max) {
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

/** MAGNET: ground letters in range slide toward the player (letters they already own stay put). */
function magnetPull(w: World, p: Player): void {
  for (const c of w.copies) {
    if (c.state !== 'ground' || ownsLetter(w, p, c.letter)) continue;
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d > MAGNET.radius || d < 1) continue;
    const move = Math.min(d, MAGNET.speed * DT);
    c.x += ((p.x - c.x) / d) * move;
    c.y += ((p.y - c.y) / d) * move;
  }
}

export function updatePickups(w: World): void {
  for (const p of w.players) {
    if (!p.alive) continue;
    if (p.fx.magnet > 0) magnetPull(w, p);
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

/** Every LETTER_SPAWN.every seconds, 3 new letters appear (up to the ground cap). */
export function updateWave(w: World, dt: number): void {
  w.wave.timer = (w.wave.timer ?? LETTER_SPAWN.every) - dt;
  if (w.wave.timer > 0) return;
  w.wave.timer += LETTER_SPAWN.every;
  if (spawnWave(w, LETTER_SPAWN.groundCap, LETTER_SPAWN.count) > 0) w.events.push({ t: 'letterWave' });
}

/** Death drops left alone for DROP_DECAY.wait + flash seconds vanish back into the pool (fresh, no XP). */
export function updateDropDecay(w: World, dt: number): void {
  for (const c of w.copies) {
    if (c.state !== 'ground' || c.wave) continue;
    c.idle += dt;
    if (c.idle < DROP_DECAY.wait + DROP_DECAY.flash) continue;
    c.state = 'pool';
    c.idle = 0;
    c.xp = 0;
    c.upgraded = false;
    c.bold = false;
    c.capitalCd = 0;
    c.hp = PLAYER_HP;
  }
}

/** Put one copy on the ground near (x, y) as a normal pickup, keeping XP/upgrade state. HP refills. */
export function dropCopy(w: World, c: LetterCopy, x: number, y: number): void {
  const ang = w.rng.next() * Math.PI * 2;
  const rad = 30 + w.rng.next() * DROP_SCATTER;
  c.state = 'ground';
  c.owner = null;
  c.wave = false;
  c.idle = 0;
  c.capitalTimer = 0;
  c.hp = copyMaxHp(c);
  c.x = Math.min(MAP_SIZE - 40, Math.max(40, x + Math.cos(ang) * rad));
  c.y = Math.min(MAP_SIZE - 40, Math.max(40, y + Math.sin(ang) * rad));
}

/** All owned letters scatter near the player as normal pickups, keeping XP/upgrade state. */
export function dropLetters(w: World, p: Player): void {
  for (const id of p.letters) dropCopy(w, w.copies[id], p.x, p.y);
  p.letters = [];
  p.active = null;
}
