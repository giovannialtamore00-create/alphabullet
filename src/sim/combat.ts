import { CHUNKY, FREEZE, JET, PLAYER_HP, SPEED, SPIN, XP } from './config';
import { getForm, shieldCovers, type DerivedForm } from './glyphDerive';
import type { LetterCopy, Mob, Player, World } from './types';

export function activeCopy(w: World, p: Player): LetterCopy | null {
  return p.active === null ? null : w.copies[p.active];
}

export function activeForm(w: World, p: Player): DerivedForm | null {
  const c = activeCopy(w, p);
  return c ? getForm(c.letter, c.capitalTimer > 0) : null;
}

/** SPIN/FLIP pose of the glyph: mirrored top-to-bottom (FLIP), then turned by `rot` radians (SPIN). */
export interface Pose {
  flip: boolean;
  rot: number;
}
export function glyphPose(p: Player): Pose {
  const rot = p.fx.jet > 0 ? (JET.duration - p.fx.jet) * JET.revPerSec * Math.PI * 2 : p.fx.spin > 0 ? (SPIN.duration - p.fx.spin) * SPIN.revPerSec * Math.PI * 2 : 0;
  return { flip: p.fx.flip > 0, rot };
}

/** Glyph-space point or direction -> world space under a pose. */
export function posePoint(pose: Pose, x: number, y: number): [number, number] {
  const fy = pose.flip ? -y : y;
  if (!pose.rot) return [x, fy];
  const c = Math.cos(pose.rot);
  const s = Math.sin(pose.rot);
  return [x * c - fy * s, x * s + fy * c];
}

/** World angle (deg) -> glyph-space angle (deg) under a pose, for shield arcs. */
export function poseAngleToGlyph(pose: Pose, deg: number): number {
  let a = deg - (pose.rot * 180) / Math.PI;
  if (pose.flip) a = -a;
  return ((a % 360) + 360) % 360;
}

/** Glyph-space angle (deg) -> world angle (deg), for drawing shield arcs. */
export function poseAngleToWorld(pose: Pose, deg: number): number {
  return (pose.flip ? -deg : deg) + (pose.rot * 180) / Math.PI;
}

/** Movement speed multiplier: SPEED word and FREEZE slow. */
export function speedMul(p: Player): number {
  return (p.fx.speed > 0 ? SPEED.mul : 1) * (1 - p.slow);
}

/** FREEZE hit: +5% slow (max 20%), timer refreshed. */
export function addSlow(t: { slow?: number; slowT?: number }): void {
  t.slow = Math.min(FREEZE.max, (t.slow ?? 0) + FREEZE.perHit);
  t.slowT = FREEZE.slowTime;
}

/** CHUNKY makes the body (glyph, hitbox, gun positions) bigger. */
export const bodyMul = (p: Player): number => (p.fx.chunky > 0 ? CHUNKY.sizeMul : 1);

export function playerRadius(w: World, p: Player): number {
  return (activeForm(w, p)?.radius ?? 18) * bodyMul(p);
}

/** Max HP of one letter's own pool. */
export function copyMaxHp(_c: LetterCopy): number {
  return PLAYER_HP;
}

/**
 * Make copy `id` the active letter. Each letter has its own HP pool: the old letter keeps
 * its current HP, and Player.hp/maxHp now show the new letter's pool.
 */
export function selectLetter(w: World, p: Player, id: number): void {
  const old = activeCopy(w, p);
  if (old && old.owner === p.id) old.hp = p.hp;
  p.active = id;
  const c = w.copies[id];
  p.hp = c.hp;
  p.maxHp = copyMaxHp(c);
}

/** Add XP to the copy that dealt damage, if its owner still holds it. Level 1 = BOLD, level 2 = CAPITAL. */
export function creditXp(w: World, attacker: number | null, copyId: number | null, amount: number): void {
  if (attacker === null || copyId === null) return;
  const c = w.copies[copyId];
  if (!c || c.owner !== attacker || c.upgraded) return;
  c.xp += amount;
  if (!c.bold && c.xp >= XP.threshold) {
    c.bold = true;
    w.events.push({ t: 'bold', id: attacker, letter: c.letter });
  }
  if (c.bold && c.xp >= XP.capitalThreshold) {
    c.upgraded = true;
    w.events.push({ t: 'upgrade', id: attacker, letter: c.letter });
  }
}

/**
 * Damage a player. Damage arriving from (sx, sy) inside a shield arc is absorbed up to the
 * shield's remaining per-second budget; the rest reaches HP. Returns HP damage dealt.
 */
export function damagePlayer(
  w: World,
  p: Player,
  amount: number,
  sx: number,
  sy: number,
  attacker: number | null,
  blockable = true,
): number {
  if (!p.alive || p.god || p.spawnProt > 0 || amount <= 0) return 0;
  if (blockable) {
    const form = activeForm(w, p);
    if (form && form.shieldCap > 0 && p.shieldBudget > 0) {
      const angle = ((Math.atan2(sy - p.y, sx - p.x) * 180) / Math.PI + 360) % 360;
      if (shieldCovers(form, poseAngleToGlyph(glyphPose(p), angle))) {
        const absorbed = Math.min(amount, p.shieldBudget);
        p.shieldBudget -= absorbed;
        amount -= absorbed;
        w.events.push({ t: 'shieldBlock', id: p.id, x: sx, y: sy, amount: absorbed, angle });
      }
    }
  }
  if (amount <= 0) return 0;
  if (p.tempHp > 0) {
    // CAPITAL bonus HP soaks damage first.
    const soak = Math.min(p.tempHp, amount);
    p.tempHp -= soak;
    amount -= soak;
    if (amount <= 0) {
      w.events.push({ t: 'hit', target: 'player', id: p.id, x: p.x, y: p.y, dmg: soak, by: attacker });
      if (attacker !== null && attacker !== p.id) p.lastDamager = attacker;
      return soak;
    }
  }
  p.hp -= amount;
  if (attacker !== null && attacker !== p.id) p.lastDamager = attacker;
  w.events.push({ t: 'hit', target: 'player', id: p.id, x: p.x, y: p.y, dmg: amount, by: attacker });
  return amount;
}

export function damageMob(w: World, m: Mob, amount: number, attacker: number | null, copyId: number | null): number {
  if (m.hp <= 0) return 0;
  const dealt = Math.min(amount, m.hp);
  m.hp -= amount;
  m.lastHitBy = attacker;
  m.lastHitCopy = copyId;
  w.events.push({ t: 'hit', target: 'mob', id: m.id, x: m.x, y: m.y, dmg: dealt, by: attacker });
  return dealt;
}
