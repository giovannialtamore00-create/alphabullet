import { XP } from './config';
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

/** Add XP to the copy that dealt damage, if its owner still holds it. Unlocks the upgrade at threshold. */
export function creditXp(w: World, attacker: number | null, copyId: number | null, amount: number): void {
  if (attacker === null || copyId === null) return;
  const c = w.copies[copyId];
  if (!c || c.owner !== attacker || c.upgraded) return;
  c.xp += amount;
  if (c.xp >= XP.threshold) {
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
