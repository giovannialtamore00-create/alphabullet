import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/sim/world';
import { creditXp, xpDamageMul, xpRangeMul, xpRateMul } from '../../src/sim/combat';
import { XP } from '../../src/sim/config';

describe('xp levels', () => {
  it('+15% damage at 300, +20% fire rate at 500, BOLD +25% HP at 800, CAPITAL at 1000, +20% range at 1200, then XP stops', () => {
    const w = createWorld(1, [{ name: 'a', bot: false }] as never);
    const id = w.players[0].active!;
    const c = w.copies[id];
    expect([xpDamageMul(c), xpRateMul(c)]).toEqual([1, 1]);
    creditXp(w, 0, id, XP.damageThreshold);
    expect([xpDamageMul(c), xpRateMul(c)]).toEqual([1.15, 1]);
    creditXp(w, 0, id, XP.rateThreshold - XP.damageThreshold);
    expect([xpDamageMul(c), xpRateMul(c)]).toEqual([1.15, 1.2]);
    expect(w.events.filter((e) => e.t === 'levelup').length).toBe(2);
    expect(c.bold).toBe(false);
    creditXp(w, 0, id, XP.threshold - XP.rateThreshold);
    expect([c.bold, c.upgraded, w.players[0].maxHp, w.players[0].hp]).toEqual([true, false, 125, 125]);
    creditXp(w, 0, id, XP.capitalThreshold - XP.threshold);
    expect(c.upgraded).toBe(true);
    expect(xpRangeMul(c)).toBe(1);
    creditXp(w, 0, id, XP.rangeThreshold - XP.capitalThreshold);
    expect(xpRangeMul(c)).toBe(1.2);
    expect(w.events.filter((e) => e.t === 'levelup' && e.level === 5).length).toBe(1);
    const xp = c.xp;
    creditXp(w, 0, id, 100);
    expect(c.xp).toBe(xp);
  });
});
