import { describe, expect, it } from 'vitest';
import { botInput, createBrain } from '../../src/sim/bots';
import { VOID } from '../../src/sim/config';
import { isolate, testWorld } from './helpers';

function setup(dist: number, t: number) {
  const w = testWorld(6, 3);
  isolate(w);
  const p = w.players[1];
  w.fog.x = 3000; w.fog.y = 3000; w.fog.r = 100000; // fog must not steer the bot
  p.x = 3000 + dist;
  p.y = 3000;
  w.voids.push({ id: 900, owner: 0, x: 3000, y: 3000, t });
  return { w, p };
}

describe('bots and VOID', () => {
  it('runs away while the void is arming', () => {
    const { w } = setup(VOID.radius - 20, 0);
    expect(botInput(w, 1, createBrain(1)).mx).toBe(1);
  });
  it('inner half: never escapes (0%)', () => {
    for (let s = 1; s <= 200; s++) {
      const { w } = setup(VOID.radius * 0.4, VOID.arm + 0.1);
      const b = createBrain(s);
      botInput(w, 1, b);
      expect(b.voidRoll.get(900)).toBe(false);
    }
  });
  it('outer half: escape rate ~40% at the half line, ~60% at the rim', () => {
    const rate = (frac: number) => {
      let n = 0;
      for (let s = 1; s <= 2000; s++) {
        const { w } = setup(VOID.radius * frac, VOID.arm + 0.1);
        const b = createBrain(s);
        
        botInput(w, 1, b);
        if (b.voidRoll.get(900)) n++;
      }
      return n / 2000;
    };
    expect(rate(0.51)).toBeGreaterThan(0.35);
    expect(rate(0.51)).toBeLessThan(0.46);
    expect(rate(0.99)).toBeGreaterThan(0.55);
    expect(rate(0.99)).toBeLessThan(0.65);
  });
});
