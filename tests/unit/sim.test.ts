import { describe, expect, it } from 'vitest';
import {
  CAPITAL_COOLDOWN,
  CAPITAL_DURATION,
  DT,
  FOG_STAGES,
  GROUND_LETTERS,
  MAP_SIZE,
  PLAYER_SPEED,
  RESPAWN_DELAY,
  RESPAWN_MIN_DIST_FROM_OLD,
  XP,
} from '../../src/sim/config';
import { activeCopy, activeForm, damagePlayer } from '../../src/sim/combat';
import { updateFog } from '../../src/sim/fog';
import { updateWave, waveCount, updatePickups } from '../../src/sim/letters';
import { makeMob } from '../../src/sim/mobs';
import type { Player, World } from '../../src/sim/types';
import { createWorld, debugGiveLetter, debugUpgradeActive, hashWorld, removePlayer, step } from '../../src/sim/world';
import { isolate, run, testWorld } from './helpers';

/** Make player `id` hold exactly `letter` (owned + active), returning its copy. */
function equip(w: World, id: number, letter: string) {
  const p = w.players[id];
  for (const c of p.letters) {
    w.copies[c].state = 'pool';
    w.copies[c].owner = null;
  }
  p.letters = [];
  p.active = null;
  for (const c of w.copies.filter((k) => k.letter === letter && k.state === 'owned')) {
    const o = w.players[c.owner!];
    o.letters = o.letters.filter((x) => x !== c.id);
    if (o.active === c.id) o.active = o.letters[0] ?? null;
    c.state = 'pool';
    c.owner = null;
  }
  expect(debugGiveLetter(w, id, letter)).toBe(true);
  return activeCopy(w, p)!;
}

describe('setup and letter pool', () => {
  it('has 52 copies, 2 per letter', () => {
    const w = testWorld();
    expect(w.copies).toHaveLength(52);
    const counts = new Map<string, number>();
    for (const c of w.copies) counts.set(c.letter, (counts.get(c.letter) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
  });

  it('each player starts with 2 distinct letters, and 8 letters are on the map', () => {
    const w = testWorld(7);
    for (const p of w.players) {
      expect(p.letters).toHaveLength(2);
      expect(w.copies[p.letters[0]].letter).not.toBe(w.copies[p.letters[1]].letter);
      expect(p.active).toBe(p.letters[0]);
    }
    expect(waveCount(w)).toBe(GROUND_LETTERS);
    expect(w.copies.filter((c) => c.state === 'owned')).toHaveLength(16);
  });

  it('players spawn spread out', () => {
    const w = testWorld(3);
    for (const a of w.players)
      for (const b of w.players) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(800);
  });

  it('walking over a letter you already own does nothing', () => {
    const w = testWorld();
    isolate(w);
    const p = w.players[0];
    const owned = w.copies[p.letters[0]];
    const twin = w.copies.find((c) => c.letter === owned.letter && c.id !== owned.id)!;
    twin.state = 'ground';
    twin.owner = null;
    twin.x = p.x;
    twin.y = p.y;
    updatePickups(w);
    expect(twin.state).toBe('ground');
    expect(p.letters).toHaveLength(2);
  });

  it('picking up a new letter adds it', () => {
    const w = testWorld();
    isolate(w);
    const p = w.players[0];
    const c = w.copies.find((k) => k.state === 'pool' && !p.letters.some((id) => w.copies[id].letter === k.letter))!;
    c.state = 'ground';
    c.x = p.x + 10;
    c.y = p.y;
    updatePickups(w);
    expect(c.state).toBe('owned');
    expect(c.owner).toBe(0);
    expect(p.lettersCollected).toBe(1);
  });

  it('never lets more than 2 players hold a letter or one player hold a duplicate', () => {
    const w = testWorld(11, 8, true);
    for (let t = 0; t < 400; t++) {
      step(w, Object.fromEntries(w.players.map((p) => [p.id, { mx: Math.sin(t / 20 + p.id), my: Math.cos(t / 30 + p.id), switchTo: null, capital: false }])));
      for (const p of w.players) {
        const letters = p.letters.map((id) => w.copies[id].letter);
        expect(new Set(letters).size).toBe(letters.length);
      }
    }
  });
});

describe('respawn rule', () => {
  it('starts a 2-minute timer at 50% taken, then refills to 8 in new spots', () => {
    const w = testWorld(5);
    const ground = w.copies.filter((c) => c.state === 'ground');
    const oldSpots = ground.map((c) => ({ x: c.x, y: c.y }));
    updateWave(w, DT);
    expect(w.wave.timer).toBeNull();
    for (const c of ground.slice(0, 3)) giveTo(w, c);
    updateWave(w, DT);
    expect(w.wave.timer).toBeNull(); // 5 left: not yet
    giveTo(w, ground[3]);
    updateWave(w, DT);
    expect(w.wave.timer).toBe(RESPAWN_DELAY);
    updateWave(w, RESPAWN_DELAY - 1);
    expect(waveCount(w)).toBe(4);
    updateWave(w, 1.01);
    expect(waveCount(w)).toBe(GROUND_LETTERS);
    const fresh = w.copies.filter((c) => c.state === 'ground' && c.wave && !ground.includes(c));
    expect(fresh).toHaveLength(4);
    for (const c of fresh)
      for (const s of oldSpots) expect(Math.hypot(c.x - s.x, c.y - s.y)).toBeGreaterThan(RESPAWN_MIN_DIST_FROM_OLD * 0.5);
  });

  it('stops spawning when every copy is owned or on the ground', () => {
    const w = testWorld(5);
    for (const c of w.copies) if (c.state === 'pool') c.state = 'owned';
    for (const c of w.copies.filter((k) => k.state === 'ground').slice(0, 6)) giveTo(w, c);
    updateWave(w, DT);
    expect(w.wave.timer).toBeNull();
  });

  it('letters never spawn inside the fog', () => {
    const w = testWorld(9);
    w.fog.r = 900;
    w.fog.toR = 400;
    for (const c of w.copies) if (c.state === 'ground') c.state = 'pool';
    w.wave.timer = 0.01;
    updateWave(w, DT);
    for (const c of w.copies.filter((k) => k.state === 'ground'))
      expect(Math.hypot(c.x - w.fog.x, c.y - w.fog.y)).toBeLessThanOrEqual(w.fog.r);
  });
});

function giveTo(_w: World, c: World['copies'][number]) {
  c.state = 'owned';
  c.owner = 99;
}

describe('movement', () => {
  it('moves at player speed, diagonals normalized, clamped to map', () => {
    const w = testWorld();
    isolate(w);
    const p = w.players[0];
    const x0 = p.x;
    run(w, 30, { 0: { mx: 1, my: 0, switchTo: null, capital: false } });
    expect(p.x - x0).toBeCloseTo(PLAYER_SPEED, 0);
    const y0 = p.y, x1 = p.x;
    run(w, 30, { 0: { mx: 1, my: 1, switchTo: null, capital: false } });
    expect(Math.hypot(p.x - x1, p.y - y0)).toBeCloseTo(PLAYER_SPEED, 0);
    p.x = 10;
    run(w, 5, { 0: { mx: -1, my: 0, switchTo: null, capital: false } });
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThan(MAP_SIZE);
  });

  it('switching letters needs ownership and has a cooldown', () => {
    const w = testWorld();
    isolate(w);
    const p = w.players[0];
    const [a, b] = p.letters.map((id) => w.copies[id].letter);
    step(w, { 0: { mx: 0, my: 0, switchTo: b, capital: false } });
    expect(w.copies[p.active!].letter).toBe(b);
    step(w, { 0: { mx: 0, my: 0, switchTo: a, capital: false } });
    expect(w.copies[p.active!].letter).toBe(b); // cooldown
    run(w, 15);
    step(w, { 0: { mx: 0, my: 0, switchTo: a, capital: false } });
    expect(w.copies[p.active!].letter).toBe(a);
    const notOwned = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((k) => k !== a && k !== b)!;
    run(w, 15);
    step(w, { 0: { mx: 0, my: 0, switchTo: notOwned, capital: false } });
    expect(w.copies[p.active!].letter).toBe(a);
  });
});

describe('bullets and collisions', () => {
  it('CAPITAL A fires downward from its legs and kills a mob below', () => {
    const w = testWorld();
    isolate(w);
    equip(w, 0, 'A');
    debugUpgradeActive(w, 0);
    step(w, { 0: { mx: 0, my: 0, switchTo: null, capital: true } });
    const p = w.players[0];
    const mob = makeMob(w, '#', p.x + 5, p.y + 200);
    mob.speed = 0;
    w.mobs.push(mob);
    run(w, 20);
    const mine = w.bullets.filter((b) => b.owner === 0);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.every((b) => b.vy > 0 && b.vx === 0)).toBe(true);
    run(w, 200);
    expect(w.mobs.includes(mob)).toBe(false);
    expect(p.mobKills).toBe(1);
  });

  it('mobs absorb bullets (a mob shields a player behind it)', () => {
    const w = testWorld();
    isolate(w);
    equip(w, 0, 'A');
    const p = w.players[0];
    const wall = makeMob(w, '#', p.x, p.y + 120);
    wall.hp = 1e9;
    wall.maxHp = 1e9;
    wall.speed = 0;
    wall.r = 60;
    w.mobs.push(wall);
    const q = w.players[1];
    q.x = p.x;
    q.y = p.y + 300;
    const hp = q.hp;
    run(w, 60);
    expect(q.hp).toBe(hp);
  });

  it('bullets hurt other players but never their owner', () => {
    const w = testWorld();
    isolate(w);
    equip(w, 0, 'A');
    equip(w, 1, 'L');
    const p = w.players[0];
    const q = w.players[1];
    q.x = p.x;
    q.y = p.y + 110; // lowercase a: short legs, short range
    let selfHits = 0;
    for (let t = 0; t < 60; t++) {
      step(w, {});
      selfHits += w.events.filter((e) => e.t === 'hit' && e.target === 'player' && e.id === e.by).length;
    }
    expect(q.hp).toBeLessThan(100);
    expect(selfHits).toBe(0);
    expect(q.lastDamager).toBe(0);
  });
});

describe('shields', () => {
  it('blocks up to the per-second cap from the covered side only', () => {
    const w = testWorld();
    isolate(w);
    equip(w, 0, 'D'); // lowercase d: bowl faces left
    const p = w.players[0];
    const cap = activeForm(w, p)!.shieldCap;
    run(w, 31); // fill budget
    expect(p.shieldBudget).toBeCloseTo(cap, 3);
    // From the left (covered): first `cap` damage absorbed.
    expect(damagePlayer(w, p, cap - 5, p.x - 100, p.y, null)).toBe(0);
    // Over the cap: the rest reaches HP.
    expect(damagePlayer(w, p, 20, p.x - 100, p.y, null)).toBeCloseTo(15, 5);
    // From the right (uncovered): not blocked at all.
    p.shieldBudget = cap;
    expect(damagePlayer(w, p, 10, p.x + 100, p.y, null)).toBe(10);
  });

  it('O blocks from every side', () => {
    const w = testWorld();
    isolate(w);
    equip(w, 0, 'O');
    const p = w.players[0];
    run(w, 31);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      p.shieldBudget = 100;
      expect(damagePlayer(w, p, 5, p.x + dx * 50, p.y + dy * 50, null)).toBe(0);
    }
  });

  it('budget refills at cap per second', () => {
    const w = testWorld();
    isolate(w);
    equip(w, 0, 'B');
    const p = w.players[0];
    const cap = activeForm(w, p)!.shieldCap;
    p.shieldBudget = 0;
    run(w, 15);
    expect(p.shieldBudget).toBeCloseTo(cap / 2, 0);
  });
});

describe('XP and CAPITAL upgrades', () => {
  it('damage earns XP for the active letter copy and unlocks the upgrade', () => {
    const w = testWorld();
    isolate(w);
    const c = equip(w, 0, 'P');
    const p = w.players[0];
    for (let i = 0; i < 8; i++) {
      const m = makeMob(w, '#', p.x - 11, p.y + (i % 2 ? 150 : -150));
      m.hp = m.maxHp = 1000;
      m.speed = 0;
      w.mobs.push(m);
    }
    let upgraded = false;
    for (let t = 0; t < 500 && !upgraded; t++) {
      step(w, {});
      upgraded = w.events.some((e) => e.t === 'upgrade' && e.id === 0);
    }
    expect(upgraded).toBe(true);
    expect(c.upgraded).toBe(true);
    expect(c.xp).toBeGreaterThanOrEqual(XP.threshold);
  });

  it('Shift activates CAPITAL for 20s, then reverts with a cooldown', () => {
    const w = testWorld();
    isolate(w);
    const c = equip(w, 0, 'T');
    const p = w.players[0];
    step(w, { 0: { mx: 0, my: 0, switchTo: null, capital: true } });
    expect(c.capitalTimer).toBe(0); // not upgraded yet
    debugUpgradeActive(w, 0);
    step(w, { 0: { mx: 0, my: 0, switchTo: null, capital: true } });
    expect(c.capitalTimer).toBeGreaterThan(CAPITAL_DURATION - 0.1);
    expect(activeForm(w, p)!.capital).toBe(true);
    // Fast-forward the timer instead of simulating 20s.
    c.capitalTimer = DT / 2;
    step(w, {});
    expect(c.capitalTimer).toBe(0);
    expect(c.capitalCd).toBeGreaterThan(CAPITAL_COOLDOWN - 0.1);
    expect(activeForm(w, p)!.capital).toBe(false);
    step(w, { 0: { mx: 0, my: 0, switchTo: null, capital: true } });
    expect(c.capitalTimer).toBe(0); // on cooldown
  });
});

describe('death and drops', () => {
  it('a dead player drops all letters nearby, keeping upgrade state', () => {
    const w = testWorld();
    isolate(w);
    const c = equip(w, 0, 'K');
    debugUpgradeActive(w, 0);
    debugGiveLetter(w, 0, 'Z');
    const p = w.players[0];
    for (const id of p.letters) w.copies[id].hp = 0; // every letter is out of ink
    p.hp = 0;
    p.lastDamager = 1;
    step(w, {});
    expect(p.alive).toBe(false);
    expect(w.players[1].kills).toBe(1);
    const dropped = w.copies.filter((k) => k.state === 'ground' && !k.wave);
    expect(dropped.map((k) => k.letter).sort()).toEqual(['K', 'Z']);
    for (const k of dropped) expect(Math.hypot(k.x - p.x, k.y - p.y)).toBeLessThan(200);
    expect(c.upgraded).toBe(true);
    // Whoever picks it up gets CAPITAL unlocked.
    const q = w.players[2];
    q.x = c.x;
    q.y = c.y;
    updatePickups(w);
    expect(c.owner).toBe(2);
    expect(c.upgraded).toBe(true);
  });

  it('disconnect removes a player and drops letters', () => {
    const w = testWorld();
    removePlayer(w, 3);
    expect(w.players[3].alive).toBe(false);
    expect(w.players[3].letters).toHaveLength(0);
  });
});

describe('closing fog', () => {
  it('shrinks in stages to the final circle in ~10-15 minutes', () => {
    const w = testWorld(2);
    let t = 0;
    const radii: number[] = [];
    while (w.fog.phase !== 'done' && t < 3600) {
      updateFog(w, 1);
      t += 1;
      radii.push(w.fog.r);
    }
    expect(w.fog.phase).toBe('done');
    expect(t / 60).toBeGreaterThanOrEqual(10);
    expect(t / 60).toBeLessThanOrEqual(15);
    for (let i = 1; i < radii.length; i++) expect(radii[i]).toBeLessThanOrEqual(radii[i - 1] + 1e-6);
    expect(w.fog.r).toBe(FOG_STAGES[FOG_STAGES.length - 1].radius);
  });

  it('pauses between stages', () => {
    const w = testWorld(2);
    const r0 = w.fog.r;
    updateFog(w, FOG_STAGES[0].wait - 1);
    expect(w.fog.r).toBe(r0);
  });

  it('damages players inside the fog, not shields-blockable', () => {
    const w = testWorld(2);
    isolate(w);
    equip(w, 0, 'O');
    const p = w.players[0];
    w.fog.r = 100;
    p.x = w.fog.x + 1000;
    p.y = w.fog.y;
    p.shieldBudget = 1000;
    const hp = p.hp;
    updateFog(w, 1);
    expect(p.inFog).toBe(true);
    expect(p.hp).toBeLessThan(hp);
  });
});

/** Leave the player with only their active letter, so running out of HP eliminates them. */
function lastLetter(p: Player): Player {
  p.letters = [p.active!];
  return p;
}

describe('win condition', () => {
  it('last player standing wins', () => {
    const w = testWorld();
    isolate(w);
    for (const p of w.players.slice(1)) lastLetter(p).hp = 0;
    step(w, {});
    expect(w.over).toBe(true);
    expect(w.winner).toBe(0);
    expect(w.players[0].placement).toBe(1);
    const places = w.players.map((p) => p.placement).sort((a, b) => a! - b!);
    expect(places).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('if the last players die together, the least-dead wins', () => {
    const w = testWorld(1, 3);
    isolate(w);
    lastLetter(w.players[0]).hp = -5;
    lastLetter(w.players[1]).hp = -1;
    lastLetter(w.players[2]).hp = -9;
    step(w, {});
    expect(w.over).toBe(true);
    expect(w.winner).toBe(1);
  });
});

describe('determinism', () => {
  it('same seed + same inputs = same match', () => {
    const mk = () => createWorld(42, Array.from({ length: 8 }, (_, i) => ({ name: `P${i}`, isBot: true })));
    const a = mk(), b = mk();
    for (let t = 0; t < 300; t++) {
      const inp = Object.fromEntries(a.players.map((p) => [p.id, { mx: (t + p.id) % 3 - 1, my: (t * 7 + p.id) % 3 - 1, switchTo: null, capital: false }]));
      step(a, inp);
      step(b, inp);
    }
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.mobs.length).toBeGreaterThan(0);
  });
});
