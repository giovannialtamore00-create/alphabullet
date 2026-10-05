import { BOLD, PLAYER_HP, XP } from './config';
import { getForm, shieldCovers, type DerivedForm } from './glyphDerive';
import type { LetterCopy, Mob, Player, World } from './types';

export function activeCopy(w: World, p: Player): LetterCopy | null {
  return p.active === null ? null : w.copies[p.active];
}

export function activeForm(w: World, p: Player): DerivedForm | null {
  const c = activeCopy(w, p);
  return c ? getForm(c.letter, c.capitalTimer > 0) : null;
}

export function playerRadius(w: World, p: Player): number {
  return activeForm(w, p)?.radius ?? 18;
}

/** Max HP of one letter's own pool (x1.3 if it is BOLD). */
export function copyMaxHp(c: LetterCopy): number {
  return PLAYER_HP * (c.bold ? BOLD.hpMul : 1);
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

/** Max HP follows the active letter (x1.3 if it is BOLD). HP scales proportionally on change. */
export function refreshMaxHp(w: World, p: Player): void {
  const c = activeCopy(w, p);
  const max = PLAYER_HP * (c?.bold ? BOLD.hpMul : 1);
  if (max !== p.maxHp) {
    p.hp = (p.hp * max) / p.maxHp;
    p.maxHp = max;
  }
}

/** Add XP to the copy that dealt damage, if its owner still holds it. Level 1 = CAPITAL, level 2 = BOLD. */
export function creditXp(w: World, attacker: number | null, copyId: number | null, amount: number): void {
  if (attacker === null || copyId === null) return;
  const c = w.copies[copyId];
  if (!c || c.owner !== attacker || c.bold) return;
  c.xp += amount;
  if (!c.upgraded && c.xp >= XP.threshold) {
    c.upgraded = true;
    w.events.push({ t: 'upgrade', id: attacker, letter: c.letter });
  }
  if (c.upgraded && c.xp >= XP.boldThreshold) {
    c.bold = true;
    w.events.push({ t: 'bold', id: attacker, letter: c.letter });
    const p = w.players[attacker];
    if (p.active === c.id) refreshMaxHp(w, p);
    else c.hp *= BOLD.hpMul;
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
  if (!p.alive || p.god || amount <= 0) return 0;
  if (blockable) {
    const form = activeForm(w, p);
    if (form && form.shieldCap > 0 && p.shieldBudget > 0) {
      const angle = ((Math.atan2(sy - p.y, sx - p.x) * 180) / Math.PI + 360) % 360;
      if (shieldCovers(form, angle)) {
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
