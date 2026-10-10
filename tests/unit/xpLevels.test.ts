import { describe, expect, it } from 'vitest';
import { createWorld } from '../../src/sim/world';
import { creditXp, xpDamageMul, xpRateMul } from '../../src/sim/combat';
import { XP } from '../../src/sim/config';

describe('xp levels 3 and 4', () => {
  it('+15% damage at level 3, +20% fire rate at level 4, then XP stops', () => {
    const w = createWorld(1, [{ name: 'a', bot: false }] as never);
    const id = w.players[0].active!;
    const c = w.copies[id];
    expect([xpDamageMul(c), xpRateMul(c)]).toEqual([1, 1]);
    creditXp(w, 0, id, XP.damageThreshold);
    expect([xpDamageMul(c), xpRateMul(c)]).toEqual([1.15, 1]);
    creditXp(w, 0, id, XP.rateThreshold);
    expect([xpDamageMul(c), xpRateMul(c)]).toEqual([1.15, 1.2]);
    expect(w.events.filter((e) => e.t === 'levelup').length).toBe(2);
    const xp = c.xp;
    creditXp(w, 0, id, 100);
    expect(c.xp).toBe(xp);
  });
});
