import { describe, expect, it } from 'vitest';
import { botInputs, botName, type BotBrain } from '../../src/sim/bots';
import { Rng } from '../../src/sim/rng';
import { createWorld, debugUpgradeActive, step, hashWorld } from '../../src/sim/world';
import type { PlayerInput, World } from '../../src/sim/types';
import { isolate, testWorld } from './helpers';

function runBots(w: World, ticks: number, brains = new Map<number, BotBrain>(), extra: Record<number, PlayerInput> = {}) {
  for (let i = 0; i < Math.min(ticks, 500); i++) step(w, { ...botInputs(w, brains), ...extra });
  return brains;
}

describe('bots', () => {
  it('produce the same input shape as humans', () => {
    const w = testWorld();
    const inp = botInputs(w, new Map());
    for (const v of Object.values(inp)) {
      expect(Object.keys(v).sort()).toEqual(['capital', 'mx', 'my', 'switchTo']);
      expect([-1, 0, 1]).toContain(v.mx);
      expect([-1, 0, 1]).toContain(v.my);
    }
    expect(inp[0]).toBeUndefined(); // player 0 is human in testWorld
  });

  it('have letter-based names', () => {
    expect(botName(new Rng(3))).toMatch(/^Bot-[A-Z]\d$/);
  });

  it('leave the fog toward the safe zone', () => {
    const w = testWorld(4);
    isolate(w);
    const b = w.players[1];
    w.fog.r = 1000;
    w.fog.phase = 'done';
    b.x = w.fog.x + 1600;
    b.y = w.fog.y;
    runBots(w, 150);
    expect(Math.hypot(b.x - w.fog.x, b.y - w.fog.y)).toBeLessThan(1000);
  });

  it('walk to a nearby letter and pick it up', () => {
    const w = testWorld(4);
    isolate(w);
    w.fog.timer = 1e9; // fog now starts at 30s; keep it out of this pickup test
    const b = w.players[2];
    const c = w.copies.find((k) => k.state === 'pool' && !b.letters.some((id) => w.copies[id].letter === k.letter))!;
    c.state = 'ground';
    c.x = b.x + 400;
    c.y = b.y + 200;
    runBots(w, 150);
    expect(c.owner).toBe(2);
  });

  it('head for a far letter smoothly (few direction changes)', () => {
    const w = testWorld(4);
    isolate(w);
    w.fog.timer = 1e9;
    const b = w.players[2];
    const c = w.copies.find((k) => k.state === 'pool' && !b.letters.some((id) => w.copies[id].letter === k.letter))!;
    c.state = 'ground';
    c.x = b.x + 600;
    c.y = b.y + 300;
    const brains = new Map<number, BotBrain>();
    let flips = 0;
    let last = '';
    for (let i = 0; i < 500 && c.owner !== 2; i++) {
      const inputs = botInputs(w, brains);
      const key = `${inputs[2].mx},${inputs[2].my}`;
      if (last && key !== last) flips++;
      last = key;
      step(w, inputs);
    }
    expect(c.owner).toBe(2);
    expect(flips).toBeLessThan(12);
    console.log('direction changes:', flips);
  });

  it('use CAPITAL power and fight a nearby enemy', () => {
    const w = testWorld(4);
    isolate(w);
    const b = w.players[1];
    const enemy = w.players[2];
    enemy.x = b.x + 300;
    enemy.y = b.y;
    debugUpgradeActive(w, 1);
    let capital = false;
    for (let i = 0; i < 300 && !capital; i++) {
      step(w, botInputs(w, new Map()));
      capital = w.events.some((e) => e.t === 'capital' && e.id === 1 && e.on);
    }
    expect(capital).toBe(true);
  });

  it('early in the match, healthy bots steer away from each other', () => {
    const w = createWorld(9, Array.from({ length: 2 }, (_, i) => ({ name: `B${i}`, isBot: true })), { mobs: false });
    for (const c of w.copies) if (c.state === 'ground') c.state = 'pool';
    w.players[0].x = 4000;
    w.players[0].y = 4000;
    w.players[1].x = 4300;
    w.players[1].y = 4000;
    const brains = new Map<number, BotBrain>();
    for (let i = 0; i < 20; i++) step(w, botInputs(w, brains));
    expect(w.players[1].x - w.players[0].x).toBeGreaterThan(300);
  });

  it('late in the match, a group of bots fights and switches letters', () => {
    const w = createWorld(9, Array.from({ length: 4 }, (_, i) => ({ name: `B${i}`, isBot: true })), { mobs: false });
    w.fog.stage = 3; // aggression grows with the fog
    w.players.forEach((p, i) => {
      p.x = 4000 + (i % 2) * 350;
      p.y = 4000 + Math.floor(i / 2) * 350;
    });
    const brains = new Map<number, BotBrain>();
    let switches = 0;
    for (let i = 0; i < 500 && !w.over; i++) {
      step(w, botInputs(w, brains));
      switches += w.events.filter((e) => e.t === 'switch').length;
    }
    expect(w.players.some((p) => p.hp < 100 || !p.alive)).toBe(true);
    expect(switches).toBeGreaterThan(0);
  });

  it('bot-only match with mobs runs without errors and stays deterministic', () => {
    const mk = () => createWorld(77, Array.from({ length: 8 }, (_, i) => ({ name: `B${i}`, isBot: true })));
    const a = mk(), b = mk();
    runBots(a, 500);
    runBots(b, 500);
    expect(hashWorld(a)).toBe(hashWorld(b));
    expect(a.players.reduce((s, p) => s + p.mobKills, 0)).toBeGreaterThan(0);
  });
});
