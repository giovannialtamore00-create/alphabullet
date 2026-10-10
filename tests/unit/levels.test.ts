import { describe, expect, it } from 'vitest';
import { BOLD, BULLET, FOG_STAGES, CAPITAL_TEMP_HP_FRAC, DT, LETTER_AREA_SPAWN_MUL, MAP_SIZE, MOB_KILL_HEAL_FRAC, MOB_TIERS, PLAYER_HP, PLAYER_LIVES, SPAWN_PROTECTION, XP, mobPhaseMul, mobSpawnRate, mobTierWeights } from '../../src/sim/config';
import { activeCopy, creditXp, damagePlayer } from '../../src/sim/combat';
import { makeMob, updateMobs } from '../../src/sim/mobs';
import { NO_INPUT, type World } from '../../src/sim/types';
import { debugBoldActive, debugGiveLetter, debugUpgradeActive, step } from '../../src/sim/world';
import { getForm } from '../../src/sim/glyphDerive';
import { isolate, testWorld } from './helpers';

const cap = { mx: 0, my: 0, switchTo: null, capital: true };

function setup(): World {
  const w = testWorld();
  isolate(w);
  return w;
}

describe('letter levels: BOLD (1) and CAPITAL (2)', () => {
  it('BOLD at the first threshold, CAPITAL at the second', () => {
    const w = setup();
    const c = activeCopy(w, w.players[0])!;
    creditXp(w, 0, c.id, XP.threshold);
    expect(c.bold).toBe(true);
    expect(c.upgraded).toBe(false);
    expect(w.events.some((e) => e.t === 'bold')).toBe(true);
    creditXp(w, 0, c.id, XP.capitalThreshold - XP.threshold);
    expect(c.upgraded).toBe(true);
    expect(w.events.some((e) => e.t === 'upgrade')).toBe(true);
  });

  it('BOLD only makes bullets 25% bigger: same HP, same damage', () => {
    const w = setup();
    const p = w.players[0];
    p.fireTimer = 0;
    step(w, {});
    const before = w.bullets.find((b) => b.owner === 0)!;
    debugBoldActive(w, 0);
    expect(p.maxHp).toBe(PLAYER_HP);
    w.bullets = [];
    p.fireTimer = 0;
    step(w, {});
    const after = w.bullets.find((b) => b.owner === 0)!;
    expect(after.dmg).toBeCloseTo(before.dmg, 5);
    expect(after.r).toBeCloseTo(before.r * BOLD.bulletRadiusMul, 5);
  });

  it('CAPITAL cannot be used before level 2', () => {
    const w = setup();
    debugBoldActive(w, 0);
    step(w, { 0: cap });
    expect(activeCopy(w, w.players[0])!.capitalTimer).toBe(0);
    debugUpgradeActive(w, 0);
    step(w, { 0: cap });
    expect(activeCopy(w, w.players[0])!.capitalTimer).toBeGreaterThan(0);
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
  it('HP is 70% x 80% x 80% of the original values, chunky another -30%', () => {
    expect(MOB_TIERS.slender.hp).toBeCloseTo(8 * 0.7 * 0.8 * 0.8);
    expect(MOB_TIERS.medium.hp).toBeCloseTo(24 * 0.7 * 0.8 * 0.8);
    expect(MOB_TIERS.chunky.hp).toBeCloseTo(60 * 0.7 * 0.8 * 0.8 * 0.7);
  });

  it('mob damage is half of the playtest-3 values', () => {
    expect([MOB_TIERS.slender.dmg, MOB_TIERS.medium.dmg, MOB_TIERS.chunky.dmg]).toEqual([2, 3, 5]);
  });

 it('spawn rate is flat over time', () => { expect(mobSpawnRate(600)).toBeCloseTo(mobSpawnRate(0)); expect(mobSpawnRate(0)).toBeCloseTo(2 * 3.4 * 1.3 * 0.75); });

  it('early match spawns +30%, late match -30%', () => {
    expect(mobPhaseMul(0)).toBeCloseTo(1.3);
    expect(mobPhaseMul(600)).toBeCloseTo(0.7);
    expect(mobPhaseMul(2000)).toBeCloseTo(0.7);
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

describe('range-based damage (playtest 3)', () => {
  it('shorter strokes deal more per shot: +50% at min range, +0% at max range', () => {
    const t = getForm('T', false); // arms of ~296, 689, 196, 196 px
    const byRange = [...t.emitters].sort((a, b) => a.range - b.range);
    for (let i = 1; i < byRange.length; i++) expect(byRange[i].dmgMul).toBeLessThanOrEqual(byRange[i - 1].dmgMul);
    const a = getForm('A', false).emitters.find((e) => e.range === BULLET.minRange)!;
    expect(a.dmgMul).toBeCloseTo(1.5);
    const w = getForm('W', false).emitters[0];
    expect(w.range).toBe(BULLET.maxRange);
    expect(w.dmgMul).toBeCloseTo(1);
  });

  it('the i dot is a shotgun: 6 pellets in a cone, +100% total damage', () => {
    const dot = getForm('I', false).emitters.find((e) => e.pellets > 1)!;
    expect(dot.pellets).toBe(BULLET.dotPellets);
    expect(dot.dmgMul).toBe(2);
    const w = setup();
    const p = w.players[0];
    w.copies[p.active!].letter = 'I';
    p.fireTimer = 0;
    step(w, { 0: NO_INPUT });
    const f = getForm('I', false);
    const shots = w.bullets.filter((b) => b.owner === 0 && b.vy < 0);
    expect(shots.length).toBe(BULLET.dotPellets);
    const total = shots.reduce((s, b) => s + b.dmg, 0);
    expect(total).toBeCloseTo(f.bullet.dmg * 2);
    expect(new Set(shots.map((b) => b.vx.toFixed(1))).size).toBe(BULLET.dotPellets);
  });
});

describe('per-letter HP (playtest 4)', () => {
  it('each letter keeps its own HP pool across switches', () => {
    const w = setup();
    const p = w.players[0];
    const [a, b] = p.letters;
    p.hp = 30;
    step(w, { 0: { mx: 0, my: 0, switchTo: w.copies[b].letter, capital: false } });
    expect(p.active).toBe(b);
    expect(p.hp).toBe(PLAYER_HP);
    expect(w.copies[a].hp).toBe(30);
    p.switchCd = 0;
    step(w, { 0: { mx: 0, my: 0, switchTo: w.copies[a].letter, capital: false } });
    expect(p.hp).toBe(30);
  });

  it('a letter at 0 HP drops on the floor and the player respawns elsewhere with another letter', () => {
    const w = setup();
    const p = w.players[0];
    const [a, b] = p.letters;
    const x0 = p.x, y0 = p.y;
    p.hp = 0;
    step(w, {});
    expect(p.alive).toBe(true);
    expect(p.letters).toEqual([b]);
    expect(p.active).toBe(b);
    expect(p.hp).toBe(PLAYER_HP);
    const lost = w.copies[a];
    expect(lost.state).toBe('ground');
    expect(Math.hypot(lost.x - x0, lost.y - y0)).toBeLessThan(200);
    expect(lost.hp).toBe(PLAYER_HP); // refilled for whoever picks it up
    expect(Math.hypot(p.x - x0, p.y - y0)).toBeGreaterThan(300);
    expect(w.events.some((e) => e.t === 'letterLost' && e.id === 0)).toBe(true);
    expect(p.lives).toBe(PLAYER_LIVES - 1);
  });

  it('3 lives: losing your only letter respawns you with a fresh one; the 3rd death eliminates', () => {
    const w = setup();
    const p = w.players[0];
    const [a, b] = p.letters;
    p.hp = 0;
    step(w, {}); // death 1: lose a, keep b
    p.hp = 0;
    step(w, {}); // death 2: lose b, the only letter -> fresh letter from the pool
    expect(p.alive).toBe(true);
    expect(p.lives).toBe(1);
    expect(p.letters.length).toBe(1);
    expect([a, b]).not.toContain(p.active);
    expect(p.hp).toBe(PLAYER_HP);
    debugGiveLetter(w, 0, w.copies[a].letter === 'Q' ? 'Z' : 'Q');
    p.hp = 0;
    step(w, {}); // death 3: eliminated even with letters left
    expect(p.alive).toBe(false);
    expect(p.lives).toBe(0);
  });

  it('breaking a letter counts as a kill with XP; the victim is briefly invulnerable', () => {
    const w = setup();
    const p = w.players[0];
    const killer = w.players[1];
    const xp0 = activeCopy(w, killer)!.xp;
    p.hp = 0;
    p.lastDamager = 1;
    step(w, {});
    expect(killer.kills).toBe(1);
    expect(activeCopy(w, killer)!.xp).toBe(xp0 + XP.letterBreak);
    expect(p.spawnProt).toBeGreaterThan(0);
    expect(damagePlayer(w, p, 50, p.x + 10, p.y, 1)).toBe(0);
    expect(p.hp).toBe(PLAYER_HP);
    for (let i = 0; i < Math.ceil(SPAWN_PROTECTION / DT) + 1; i++) step(w, {});
    expect(p.spawnProt).toBe(0);
    expect(damagePlayer(w, p, 50, p.x + 10, p.y, 1)).toBeGreaterThan(0);
  });

  it('fog deals 50% more damage than before', () => {
    expect(FOG_STAGES.map((s) => s.dps)).toEqual([2, 3, 5, 8, 12, 20].map((d) => d * 1.5));
  });
});
