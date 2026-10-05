/**
 * Bot brains. A bot only produces a PlayerInput each tick, exactly like a human keyboard,
 * so the sim cannot tell bots and humans apart.
 */
import { activeCopy, activeForm } from './combat';
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
  return { rng, wanderX: 0, wanderY: 0, wanderT: 0, switchT: 2 + rng.next() * 4, strafe: rng.next() < 0.5 ? 1 : -1 };
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
  if (c.bold) s += 30;
  return s;
}

export function botInput(w: World, id: number, brain: BotBrain): PlayerInput {
  const p = w.players[id];
  const inp: PlayerInput = { mx: 0, my: 0, switchTo: null, capital: false };
  if (!p?.alive) return inp;
  const dt = 1 / 30;
  let vx = 0;
  let vy = 0;

  // 1) Stay out of the fog.
  const safe = safeCircle(w);
  const dSafe = Math.hypot(safe.x - p.x, safe.y - p.y);
  const margin = Math.max(60, safe.r * 0.8);
  if (dSafe > margin) {
    const k = p.inFog ? 6 : 2 + (dSafe - margin) / 200;
    vx += ((safe.x - p.x) / dSafe) * k;
    vy += ((safe.y - p.y) / dSafe) * k;
  }

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
  let dEnemy = ENEMY_RANGE;
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
    // 4) Collect letters, else wander inside the safe circle.
    let target: { x: number; y: number } | null = null;
    let dBest = PICKUP_RANGE;
    for (const c of w.copies) {
      if (c.state !== 'ground' || ownsLetter(w, p, c.letter)) continue;
      if (Math.hypot(c.x - w.fog.x, c.y - w.fog.y) > w.fog.r) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < dBest) {
        dBest = d;
        target = c;
      }
    }
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
      vx += ((target.x - p.x) / d) * 1.2;
      vy += ((target.y - p.y) / d) * 1.2;
    }
  }

  // Quantize to 8-way arrow keys.
  const len = Math.hypot(vx, vy);
  if (len > 0.05) {
    inp.mx = Math.abs(vx / len) > 0.38 ? Math.sign(vx) : 0;
    inp.my = Math.abs(vy / len) > 0.38 ? Math.sign(vy) : 0;
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
