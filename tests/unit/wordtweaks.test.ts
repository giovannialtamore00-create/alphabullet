import { describe, expect, it } from 'vitest';
import { DISARM, ERASE, EXILE, SHIELD, XRAY } from '../../src/sim/config';
import { damagePlayer } from '../../src/sim/combat';
import { makeMob } from '../../src/sim/mobs';
import { NO_INPUT, type Bullet, type World } from '../../src/sim/types';
import { debugGiveLetter, step } from '../../src/sim/world';
import { useWord, WORDS } from '../../src/sim/words';
import { isolate, run, testWorld } from './helpers';

function setup(...words: string[]): World {
  const w = testWorld(6, 3);
  isolate(w);
  for (const word of words) for (const ch of word) debugGiveLetter(w, 0, ch);
  return w;
}

describe('word tweaks', () => {
  it('config values', () => {
    expect(DISARM.lock).toBe(0.3);
    expect(XRAY.duration).toBe(5);
    expect(ERASE.duration).toBe(12);
    expect(ERASE.cooldown).toBe(45);
  });

  it('ERASE is an active word: 45 s cooldown, 12 s timer, no passive slot', () => {
    const w = setup('ERASE');
    const p = w.players[0];
    expect(WORDS.find((d) => d.word === 'ERASE')!.passive).toBeFalsy();
    expect(useWord(w, p, 'ERASE')).toBe(true);
    expect(p.fx.erase).toBe(12);
    expect(p.wordCd.ERASE).toBe(45);
    expect(p.passives).not.toContain('ERASE');
    run(w, 12 * 30 + 2);
    expect(p.fx.erase).toBe(0);
  });

  it('ZAP keeps chaining through every adjacent target (up to the cap)', () => {
    const w = setup();
    w.players[0].x = 3500;
    w.players[0].y = 4000;
    const mobs = [0, 1, 2, 3, 4, 5].map((i) => {
      const m = makeMob(w, '#', 4000 + i * 100, 4000);
      m.hp = 1000;
      m.speed = 0;
      w.mobs.push(m);
      return m;
    });
    const b: Bullet = { id: w.nextId++, owner: 0, copyId: w.players[0].active!, x: 3960, y: 4000, vx: 540, vy: 0, r: 5, dmg: 10, life: 2, capital: false, zap: true };
    w.bullets.push(b);
    run(w, 2);
    for (const m of mobs.slice(1)) expect(m.hp).toBeLessThan(1000);
  });

  it('EXILE lands in the safe circle or at most 20% of its radius into the fog', () => {
    const w = setup('EXILE');
    const [a, near] = w.players;
    a.x = 4000;
    a.y = 4000;
    near.x = 4300;
    near.y = 4100;
    expect(useWord(w, a, 'EXILE')).toBe(true);
    const d = Math.hypot(near.x - w.fog.x, near.y - w.fog.y);
    expect(d).toBeLessThanOrEqual(w.fog.r * (1 + EXILE.fogReach) + 1);
  });

  it('XRAY deals about 2x the X letter damage per second', () => {
    const dmgOver = (xray: boolean) => {
      const w = setup(xray ? 'XRAY' : 'X');
      const p = w.players[0];
      p.x = 4000;
      p.y = 4000;
      if (xray) step(w, { 0: { ...NO_INPUT, word: 'XRAY' } });
      else p.active = p.letters.find((id) => w.copies[id].letter === 'X')!;
      // Total damage carried by every bullet the player fires in 4 s (bullets are not allowed to hit anything).
      const seen = new Set<number>();
      let total = 0;
      for (let i = 0; i < 120; i++) {
        step(w, {});
        for (const bl of w.bullets) if (bl.owner === 0 && !seen.has(bl.id)) (seen.add(bl.id), (total += bl.dmg));
      }
      return total;
    };
    const ratio = dmgOver(true) / dmgOver(false);
    console.log('xray/normal damage ratio:', ratio.toFixed(2));
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.2);
  });

  it('blocking with a shield heals', () => {
    const w = setup('D');
    const p = w.players[0];
    const d = p.letters.find((id) => w.copies[id].letter === 'D')!;
    p.active = d;
    p.shieldBudget = 1000;
    p.hp = p.maxHp - 20;
    const before = p.hp;
    // Hit from every side until one is blocked by the shield arc.
    for (const [sx, sy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) damagePlayer(w, p, 5, p.x + sx * 100, p.y + sy * 100, 1);
    expect(p.hp).toBeGreaterThan(before - 20); // 4 unblocked hits would cost 20
    expect(SHIELD.healFrac).toBeGreaterThan(0);
  });
});
