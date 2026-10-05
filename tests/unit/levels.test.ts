import { describe, expect, it } from 'vitest';
import { BOLD, CAPITAL_TEMP_HP_FRAC, DT, LETTER_AREA_SPAWN_MUL, MAP_SIZE, MOB_KILL_HEAL_FRAC, MOB_TIERS, PLAYER_HP, XP, mobSpawnRate, mobTierWeights } from '../../src/sim/config';
import { activeCopy, creditXp, damagePlayer } from '../../src/sim/combat';
import { makeMob, updateMobs } from '../../src/sim/mobs';
import type { World } from '../../src/sim/types';
import { debugBoldActive, debugUpgradeActive, step } from '../../src/sim/world';
import { isolate, testWorld } from './helpers';

const cap = { mx: 0, my: 0, switchTo: null, capital: true };

function setup(): World {
  const w = testWorld();
  isolate(w);
  return w;
}

describe('letter levels: CAPITAL (1) and BOLD (2)', () => {
  it('level 1 at the first threshold, BOLD at the second', () => {
    const w = setup();
    const c = activeCopy(w, w.players[0])!;
    creditXp(w, 0, c.id, XP.threshold);
    expect(c.upgraded).toBe(true);
    expect(c.bold).toBe(false);
    creditXp(w, 0, c.id, XP.boldThreshold - XP.threshold);
    expect(c.bold).toBe(true);
    expect(w.events.some((e) => e.t === 'bold')).toBe(true);
  });

  it('BOLD raises max HP and current HP by 30% while that letter is active, no HP from switching', () => {
    const w = setup();
    const p = w.players[0];
    p.hp = 50;
    debugBoldActive(w, 0);
    expect(p.maxHp).toBeCloseTo(PLAYER_HP * BOLD.hpMul);
    expect(p.hp).toBeCloseTo(50 * BOLD.hpMul);
    const other = w.copies[p.letters[1]].letter;
    step(w, { 0: { mx: 0, my: 0, switchTo: other, capital: false } });
    expect(p.maxHp).toBe(PLAYER_HP);
    expect(p.hp).toBeCloseTo(50, 5);
  });

  it('BOLD bullets deal 30% more damage, in both forms', () => {
    const w = setup();
    const p = w.players[0];
    for (let i = 0; i < 20; i++) step(w, {});
    const normal = w.bullets.find((b) => b.owner === 0)!.dmg;
    debugBoldActive(w, 0);
    w.bullets = [];
    for (let i = 0; i < 20; i++) step(w, {});
    expect(w.bullets.find((b) => b.owner === 0)!.dmg).toBeCloseTo(normal * BOLD.dmgMul, 5);
    step(w, { 0: cap });
    expect(activeCopy(w, p)!.capitalTimer).toBeGreaterThan(0);
  });

  it('BOLD stays with the letter when it is dropped', () => {
    const w = setup();
    debugBoldActive(w, 0);
    const c = activeCopy(w, w.players[0])!;
    w.players[0].hp = 0;
    step(w, {});
    expect(c.state).toBe('ground');
    expect(c.bold).toBe(true);
  });
});

describe('CAPITAL temporary HP', () => {
  it('grants half max HP as temp HP, absorbed first, removed when CAPITAL ends', () => {
    const w = setup();
    const p = w.players[0];
    debugUpgradeActive(w, 0);
    step(w, { 0: cap });
    expect(p.tempHp).toBeCloseTo(p.maxHp * CAPITAL_TEMP_HP_FRAC);
    damagePlayer(w, p, 20, p.x + 50, p.y, null, false);
    expect(p.hp).toBe(PLAYER_HP);
    expect(p.tempHp).toBeCloseTo(30);
    damagePlayer(w, p, 40, p.x + 50, p.y, null, false);
    expect(p.tempHp).toBe(0);
    expect(p.hp).toBeCloseTo(90);
    step(w, { 0: cap }); // on cooldown/active: no new temp HP
    const c = activeCopy(w, p)!;
    c.capitalTimer = DT / 2;
    p.tempHp = 10;
    step(w, {});
    expect(p.tempHp).toBe(0);
  });

  it('switching letters during CAPITAL removes temp HP', () => {
    const w = setup();
    const p = w.players[0];
    debugUpgradeActive(w, 0);
    step(w, { 0: cap });
    for (let i = 0; i < 16; i++) step(w, {});
    step(w, { 0: { mx: 0, my: 0, switchTo: w.copies[p.letters[1]].letter, capital: false } });
    expect(p.tempHp).toBe(0);
  });
});

describe('mobs', () => {
  it('HP is 70% x 80% of the original values', () => {
    expect(MOB_TIERS.slender.hp).toBeCloseTo(8 * 0.7 * 0.8);
    expect(MOB_TIERS.medium.hp).toBeCloseTo(24 * 0.7 * 0.8);
    expect(MOB_TIERS.chunky.hp).toBeCloseTo(60 * 0.7 * 0.8);
  });

  it('killing a mob heals 0.5% of max HP', () => {
    const w = setup();
    const p = w.players[0];
    p.hp = 50;
    const m = makeMob(w, '/', p.x, p.y + 400);
    m.speed = 0;
    m.hp = 0;
    m.lastHitBy = 0;
    w.mobs.push(m);
    updateMobs(w, DT);
    expect(p.hp).toBeCloseTo(50 + p.maxHp * MOB_KILL_HEAL_FRAC);
  });

  it('30% more small mobs at the start', () => {
    expect(mobTierWeights(0)[0]).toBeCloseTo(6 * 1.3);
  });

  it('players at the map edge get mobs from beyond the edge too', () => {
    const w = setup();
    w.mobsEnabled = true;
    const p = w.players[0];
    p.x = 30;
    p.y = MAP_SIZE / 2;
    for (const q of w.players.slice(1)) q.alive = false;
    for (let i = 0; i < 400; i++) updateMobs(w, 0.1);
    expect(w.mobs.some((m) => m.x < 0)).toBe(true);
    expect(w.mobs.some((m) => m.x > p.x)).toBe(true);
  });

  it('spawn rate is 50% higher near a letter on the ground', () => {
    const count = (withLetter: boolean) => {
      const w = setup();
      w.mobsEnabled = true;
      for (const q of w.players.slice(1)) q.alive = false;
      const p = w.players[0];
      p.x = p.y = 4000;
      if (withLetter) {
        const c = w.copies.find((k) => k.state === 'pool')!;
        c.state = 'ground';
        c.x = p.x + 300;
        c.y = p.y;
      }
      let n = 0;
      for (let i = 0; i < 300; i++) {
        const before = w.mobs.length;
        updateMobs(w, DT);
        n += Math.max(0, w.mobs.length - before);
        w.mobs = [];
      }
      return n;
    };
    const base = mobSpawnRate(0) * 300 * DT;
    expect(count(false)).toBeCloseTo(base, -1);
    expect(count(true)).toBeCloseTo(base * LETTER_AREA_SPAWN_MUL, -1);
  });

});
