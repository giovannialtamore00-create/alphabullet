/**
 * Bot brains. A bot only produces a PlayerInput each tick, exactly like a human keyboard,
 * so the sim cannot tell bots and humans apart.
 */
import { activeCopy, activeForm } from './combat';
import { SPLASH, VOID } from './config';
import { getForm } from './glyphDerive';
import { ownsLetter } from './letters';
import { Rng } from './rng';
import type { Player, PlayerInput, World } from './types';

export interface BotBrain {
  rng: Rng; // own RNG so bot choices never disturb the sim RNG (replays stay exact)
  wanderX: number;
  wanderY: number;
  wanderT: number;
  switchT: number;
  strafe: number;
  sx: number; // smoothed steering (low-pass) so movement doesn't jitter
  sy: number;
  mx: number; // last quantized output, for hysteresis
  my: number;
  target: number; // sticky letter-pickup target (copy id), -1 = none
  voidRoll: Map<number, boolean>; // void id -> this bot's one-time escape roll once caught
}

const KITE_RANGE = 330;
const ENEMY_RANGE = 750;
const PICKUP_RANGE = 1600;
const ATTACK_DIST = 320;

export function botName(rng: Rng): string {
  const L = 'ABCDEFGHJKLMNPRSTUVWXYZ';
  return `Bot-${L[rng.int(L.length)]}${rng.int(10)}`;
}

export function createBrain(seed: number): BotBrain {
  const rng = new Rng(seed);
  return { rng, wanderX: 0, wanderY: 0, wanderT: 0, switchT: 2 + rng.next() * 4, strafe: rng.next() < 0.5 ? 1 : -1, sx: 0, sy: 0, mx: 0, my: 0, target: -1, voidRoll: new Map() };
}

function safeCircle(w: World) {
  const f = w.fog;
  // Head for the next circle once the current wait is half over (or while shrinking).
  const useNext = f.phase === 'shrink' || (f.phase === 'wait' && f.timer < 40);
  return useNext && f.phase !== 'done' ? { x: f.toX, y: f.toY, r: f.toR } : { x: f.x, y: f.y, r: f.r };
}

/** Score a letter for the current situation; higher is better. */
function letterScore(w: World, p: Player, copyId: number, mobsNear: number, enemyNear: boolean): number {
  const c = w.copies[copyId];
  const f = getForm(c.letter, false);
  const dps = f.bullet.dmg * f.bullet.rate * f.emitters.reduce((a, e) => a + e.dmgMul, 0);
  let s = dps;
  if (mobsNear > 4) s += f.emitters.length * 6; // coverage vs swarms
  if (enemyNear) s += f.bullet.dmg * 3; // focus vs players
  if (p.hp < 40 && f.shieldCap > 0) s += 40;
  if (c.upgraded && c.capitalCd <= 0) s += 25;
  if (c.bold) s += 15;
  return s;
}

export function botInput(w: World, id: number, brain: BotBrain): PlayerInput {
  const p = w.players[id];
  const inp: PlayerInput = { mx: 0, my: 0, switchTo: null, capital: false };
  if (!p?.alive) return inp;
  const dt = 1 / 30;
  let vx = 0;
  let vy = 0;

  // 0) Pick a letter to collect; keep the same one until it is gone (no dithering between two).
  let pickup: { x: number; y: number } | null = null;
  const sticky = brain.target >= 0 ? w.copies[brain.target] : null;
  if (sticky && sticky.state === 'ground' && !ownsLetter(w, p, sticky.letter) && Math.hypot(sticky.x - w.fog.x, sticky.y - w.fog.y) <= w.fog.r) {
    pickup = sticky;
  } else {
    brain.target = -1;
    let dBest = PICKUP_RANGE;
    for (let i = 0; i < w.copies.length; i++) {
      const c = w.copies[i];
      if (c.state !== 'ground' || ownsLetter(w, p, c.letter)) continue;
      if (Math.hypot(c.x - w.fog.x, c.y - w.fog.y) > w.fog.r) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < dBest) {
        dBest = d;
        pickup = c;
        brain.target = i;
      }
    }
  }

  // 1) Stay out of the fog.
  const safe = safeCircle(w);
  const dSafe = Math.hypot(safe.x - p.x, safe.y - p.y);
  const margin = Math.max(60, safe.r * 0.8);
  if (dSafe > margin) {
    const k = p.inFog ? 6 : 2 + (dSafe - margin) / 200;
    vx += ((safe.x - p.x) / dSafe) * k;
    vy += ((safe.y - p.y) / dSafe) * k;
  }

  // 1b) Run from VOID holes. Once one is pulling and the bot is inside, it gets one escape roll:
  // inner half = 0%, outer half = 40% at the half-way line up to 60% at the rim. Failing the roll means it does not flee.
  for (const h of w.voids) {
    const dx = p.x - h.x;
    const dy = p.y - h.y;
    const d = Math.hypot(dx, dy) || 0.01;
    if (d > VOID.radius + 100) continue;
    if (h.t >= VOID.arm && d <= VOID.radius) {
      let ok = brain.voidRoll.get(h.id);
      if (ok === undefined) {
        const half = VOID.radius / 2;
        ok = d > half && brain.rng.next() < 0.4 + 0.2 * Math.min(1, (d - half) / half);
        brain.voidRoll.set(h.id, ok);
      }
      if (!ok) continue;
    }
    vx += (dx / d) * 12;
    vy += (dy / d) * 12;
  }
  if (brain.voidRoll.size > 8) for (const id of brain.voidRoll.keys()) if (!w.voids.some((h) => h.id === id)) brain.voidRoll.delete(id);

  // 2) Kite mobs.
  let mobsNear = 0;
  for (const m of w.mobs) {
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    if (Math.abs(dx) > KITE_RANGE || Math.abs(dy) > KITE_RANGE) continue;
    const d = Math.hypot(dx, dy);
    if (d > KITE_RANGE || d < 0.01) continue;
    mobsNear++;
    const k = ((KITE_RANGE - d) / KITE_RANGE) ** 1.5 * 3.2;
    vx += (dx / d) * k;
    vy += (dy / d) * k;
  }

  // 3) Fight the nearest enemy: move so an emitter points at them ("aim by moving").
  let enemy: Player | null = null;
  let dEnemy = p.splashT > 0 ? ENEMY_RANGE * SPLASH.botSight : ENEMY_RANGE; // inked bots see less
  for (const o of w.players) {
    if (o === p || !o.alive) continue;
    const d = Math.hypot(o.x - p.x, o.y - p.y);
    if (d < dEnemy) {
      dEnemy = d;
      enemy = o;
    }
  }
  const form = activeForm(w, p);
  // Aggression grows with the fog: avoid players while leveling up, then fight when ahead, then always.
  const stage = w.fog.stage;
  const avoid = enemy && (stage <= 1 ? enemy.hp > p.hp - 30 : stage === 2 ? enemy.hp > p.hp - 10 : p.hp < 30 && enemy.hp > p.hp + 15);
  if (enemy && form) {
    if (avoid) {
      vx += ((p.x - enemy.x) / dEnemy) * 2;
      vy += ((p.y - enemy.y) / dEnemy) * 2;
    } else {
      let best = Infinity;
      let gx = 0;
      let gy = 0;
      for (const e of form.emitters) {
        // Stand where this emitter's ray hits the enemy, slightly strafing.
        const dist = Math.min(ATTACK_DIST, e.range * 0.8);
        const tx = enemy.x - e.dx * dist - e.dy * 40 * brain.strafe;
        const ty = enemy.y - e.dy * dist + e.dx * 40 * brain.strafe;
        const d = Math.hypot(tx - p.x, ty - p.y);
        if (d < best) {
          best = d;
          gx = tx;
          gy = ty;
        }
      }
      if (best > 15) {
        vx += ((gx - p.x) / best) * 1.6;
        vy += ((gy - p.y) / best) * 1.6;
      }
    }
  } else {
    // 4) Wander inside the safe circle when there is nothing to collect.
    let target: { x: number; y: number } | null = pickup;
    brain.wanderT -= dt;
    if (!target) {
      if (brain.wanderT <= 0 || Math.hypot(brain.wanderX - p.x, brain.wanderY - p.y) < 80) {
        const ang = brain.rng.next() * Math.PI * 2;
        const rad = Math.sqrt(brain.rng.next()) * safe.r * 0.7;
        brain.wanderX = safe.x + Math.cos(ang) * rad;
        brain.wanderY = safe.y + Math.sin(ang) * rad;
        brain.wanderT = 5 + brain.rng.next() * 5;
      }
      target = { x: brain.wanderX, y: brain.wanderY };
    }
    const d = Math.hypot(target.x - p.x, target.y - p.y);
    if (d > 5) {
      const k = pickup ? 2.4 : 1.2;
      vx += ((target.x - p.x) / d) * k;
      vy += ((target.y - p.y) / d) * k;
    }
  }
  // While fighting or fleeing, still lean toward a letter that is close by.
  if (pickup && (enemy && form)) {
    const d = Math.hypot(pickup.x - p.x, pickup.y - p.y);
    if (d > 5 && d < 500) {
      vx += ((pickup.x - p.x) / d) * 1.4;
      vy += ((pickup.y - p.y) / d) * 1.4;
    }
  }

  // Smooth the steering, then quantize to 8-way arrow keys with hysteresis (no flicker at thresholds).
  const sm = 0.25;
  brain.sx += (vx - brain.sx) * sm;
  brain.sy += (vy - brain.sy) * sm;
  const len = Math.hypot(brain.sx, brain.sy);
  if (len > 0.05) {
    const ax = Math.abs(brain.sx / len);
    const ay = Math.abs(brain.sy / len);
    brain.mx = ax > (brain.mx ? 0.3 : 0.45) ? Math.sign(brain.sx) : 0;
    brain.my = ay > (brain.my ? 0.3 : 0.45) ? Math.sign(brain.sy) : 0;
    inp.mx = brain.mx;
    inp.my = brain.my;
  } else {
    brain.mx = 0;
    brain.my = 0;
  }

  // 5) Switch letters now and then, picking the best one for the situation.
  brain.switchT -= dt;
  const cur = activeCopy(w, p);
  if (brain.switchT <= 0 && p.letters.length > 1 && !(cur && cur.capitalTimer > 0)) {
    brain.switchT = 4 + brain.rng.next() * 6;
    const enemyNear = !!enemy && dEnemy < 600;
    let bestId = p.active;
    let bestScore = -Infinity;
    for (const cid of p.letters) {
      const s = letterScore(w, p, cid, mobsNear, enemyNear) + (cid === p.active ? 8 : 0);
      if (s > bestScore) {
        bestScore = s;
        bestId = cid;
      }
    }
    if (bestId !== null && bestId !== p.active) inp.switchTo = w.copies[bestId].letter;
  }

  // 6) CAPITAL power when it matters.
  if (cur && cur.upgraded && cur.capitalTimer <= 0 && cur.capitalCd <= 0) {
    if ((enemy && dEnemy < 650) || mobsNear >= 5) inp.capital = true;
  }
  return inp;
}

/** Inputs for every alive bot this tick. */
export function botInputs(w: World, brains: Map<number, BotBrain>): Record<number, PlayerInput> {
  const out: Record<number, PlayerInput> = {};
  for (const p of w.players) {
    if (!p.isBot || !p.alive) continue;
    let b = brains.get(p.id);
    if (!b) brains.set(p.id, (b = createBrain(w.seed * 31 + p.id * 7919)));
    out[p.id] = botInput(w, p.id, b);
  }
  return out;
}
