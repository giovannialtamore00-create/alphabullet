import { describe, expect, it, vi } from 'vitest';
import { BOMB, DASH, PIERCE, PVP_DAMAGE_MUL } from '../../src/sim/config';
import { makeMob } from '../../src/sim/mobs';
import { NO_INPUT, type Bullet, type World } from '../../src/sim/types';
import { debugGiveLetter, step } from '../../src/sim/world';
import { matchWord, useWord } from '../../src/sim/words';
import { isolate, run, testWorld } from './helpers';

function setup(...words: string[]): World {
  const w = testWorld(6); // a seed where bots leave D, A, S, H, P, I, E, R, C, B, O, M, Z free
  isolate(w);
  for (const word of words) for (const ch of word) debugGiveLetter(w, 0, ch);
  return w;
}

const say = (word: string) => ({ ...NO_INPUT, word });

describe('word powers', () => {
  it('does nothing unless the player owns every letter', () => {
    const w = setup();
    const p = w.players[0];
    const x = p.x;
    step(w, { 0: say('DASH') });
    expect(p.x).toBe(x);
    expect(w.events.some((e) => e.t === 'word')).toBe(false);
  });

  it('DASH teleports along the last movement direction, then is on cooldown', () => {
    const w = setup('DASH');
    const p = w.players[0];
    step(w, { 0: { ...NO_INPUT, mx: 1 } });
    const x = p.x;
    step(w, { 0: say('DASH') });
    expect(p.x).toBeCloseTo(x + DASH.dist);
    expect(w.events.some((e) => e.t === 'word' && e.word === 'DASH')).toBe(true);
    step(w, { 0: say('DASH') });
    expect(p.x).toBeCloseTo(x + DASH.dist); // cooldown
    expect(p.wordCd.DASH).toBeGreaterThan(0);
  });

  it('DASH stays inside the map', () => {
    const w = setup('DASH');
    const p = w.players[0];
    p.x = 100;
    step(w, { 0: { ...NO_INPUT, mx: -1 } });
    step(w, { 0: say('DASH') });
    expect(p.x).toBeGreaterThanOrEqual(20);
  });

  it('BOMB damages mobs and enemies inside the radius only', () => {
    const w = setup('BOMB');
    const p = w.players[0];
    const near = makeMob(w, '#', p.x + BOMB.radius - 50, p.y);
    const far = makeMob(w, '#', p.x + BOMB.radius + 200, p.y);
    near.hp = far.hp = 1000;
    w.mobs.push(near, far);
    const q = w.players[1];
    q.x = p.x;
    q.y = p.y - 100;
    const qhp = q.hp;
    w.events = [];
    expect(useWord(w, p, 'BOMB')).toBe(true);
    expect(near.hp).toBeCloseTo(1000 - BOMB.dmg);
    expect(far.hp).toBe(1000);
    expect(q.hp).toBeLessThan(qhp);
    expect(qhp - q.hp - 0).toBeLessThanOrEqual(BOMB.dmg * PVP_DAMAGE_MUL + 1e-9);
  });

  it('PIERCE stays on and pierce bullets hit every mob in a line once', () => {
    const w = setup('PIERCE');
    const p = w.players[0];
    step(w, { 0: say('PIERCE') });
    expect(p.fx.pierce).toBeGreaterThan(PIERCE.duration - 0.1);
    // A lone pierce bullet flying right through two mobs.
    const a = makeMob(w, '#', 4000, 4000);
    const b = makeMob(w, '#', 4060, 4000);
    a.hp = b.hp = 1000;
    a.speed = b.speed = 0;
    w.mobs.push(a, b);
    const bullet: Bullet = { id: 99999, owner: 0, copyId: p.active!, x: 3960, y: 4000, vx: 540, vy: 0, r: 5, dmg: 10, life: 1, capital: false, pierce: true };
    w.bullets.push(bullet);
    run(w, 10);
    expect(a.hp).toBe(990);
    expect(b.hp).toBe(990);
    run(w, Math.ceil(PIERCE.duration * 30));
    expect(p.fx.pierce).toBeGreaterThan(0); // passive: never runs out
  });

  it('matchWord finds a word at the end of the typed letters', () => {
    expect(matchWord('XXDASH')).toBe('DASH');
    expect(matchWord('PIERCE')).toBe('PIERCE');
    expect(matchWord('BOM')).toBe(null);
  });

  it('keyboard sends a word only when its letters are typed quickly', async () => {
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
    const { Keyboard } = await import('../../src/input/keyboard');
    const kb = new Keyboard();
    [...'BOMB'].forEach((ch, i) => kb.typeLetter(ch, 10 + i * 0.2));
    expect(kb.poll().word).toBe('BOMB');
    expect(kb.poll().word).toBe(null); // sent once
    [...'BOMB'].forEach((ch, i) => kb.typeLetter(ch, 20 + i * 1.5));
    expect(kb.poll().word).toBe(null);
    vi.unstubAllGlobals();
  });

  it('keyboard remembers the letter held before the word started', async () => {
    vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });
    const { Keyboard } = await import('../../src/input/keyboard');
    const kb = new Keyboard();
    // Held Z, then typed D-A-S-H (each key switches the held letter).
    ['Z', 'D', 'A', 'S'].forEach((held, i) => kb.typeLetter('DASH'[i], 10 + i * 0.2, held));
    expect(kb.poll()).toMatchObject({ word: 'DASH', wordBack: 'Z' });
    vi.unstubAllGlobals();
  });

  it('after a word the player switches back to the letter held before it, even on switch cooldown', () => {
    const w = setup('DASH', 'Z');
    const p = w.players[0];
    step(w, { 0: { ...NO_INPUT, switchTo: 'Z' } });
    for (let i = 0; i < 20; i++) step(w, { 0: NO_INPUT });
    // Same tick: switching to H starts the switch cooldown, the return to Z must still happen.
    step(w, { 0: { ...NO_INPUT, switchTo: 'H', word: 'DASH', wordBack: 'Z' } });
    expect(w.copies[p.active!].letter).toBe('Z');
    expect(w.events.some((e) => e.t === 'word')).toBe(true);
  });
});

describe('BOMB continuous, toggle-off, EXILE ordering', () => {
  it('BOMB blasts on typing, again every 20 s, and stops when typed again', () => {
    const w = setup('BOMB');
    const p = w.players[0];
    const m = makeMob(w, '#', p.x + 100, p.y);
    m.hp = 100000;
    m.speed = 0;
    w.mobs.push(m);
    expect(useWord(w, p, 'BOMB')).toBe(true);
    expect(m.hp).toBeCloseTo(100000 - BOMB.dmg);
    for (let i = 0; i < 30 * 19; i++) step(w, { 0: NO_INPUT });
    expect(m.hp).toBeCloseTo(100000 - BOMB.dmg);
    for (let i = 0; i < 30 * 2; i++) step(w, { 0: NO_INPUT });
    expect(m.hp).toBeLessThan(100000 - BOMB.dmg - BOMB.dmg / 2);
    expect(useWord(w, p, 'BOMB')).toBe(true); // off
    const hp = m.hp;
    for (let i = 0; i < 30 * 25; i++) step(w, { 0: NO_INPUT });
    expect(m.hp).toBe(hp);
  });

  it('typing a running ERASE switches it off', () => {
    const w = setup('ERASE');
    const p = w.players[0];
    useWord(w, p, 'ERASE');
    expect(p.fx.erase).toBeGreaterThan(0);
    expect(useWord(w, p, 'ERASE')).toBe(true);
    expect(p.fx.erase).toBe(0);
  });

  it('EXILE sends the closer enemy farther away', () => {
    const w = setup('EXILE');
    const p = w.players[0];
    p.x = 4000;
    p.y = 4000;
    const [, near, far] = w.players;
    near.x = 4000 + 100;
    near.y = 4000;
    far.x = 4000 + 700;
    far.y = 4000;
    expect(useWord(w, p, 'EXILE')).toBe(true);
    const dn = Math.hypot(near.x - p.x, near.y - p.y);
    const df = Math.hypot(far.x - p.x, far.y - p.y);
    expect(dn).toBeGreaterThan(df);
    expect(df).toBeGreaterThan(1000);
    for (const q of [near, far]) expect(Math.hypot(q.x - w.fog.x, q.y - w.fog.y)).toBeLessThanOrEqual(w.fog.r * 1.5 + 25);
  });
});
