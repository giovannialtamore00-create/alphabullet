import { describe, expect, it } from 'vitest';
import { DISARM, EXILE, FREEZE, JET, XRAY, MAGNET, PUSH, SPEED, VOID, WORD_IMMUNITY, ZAP } from '../../src/sim/config';
import { makeMob } from '../../src/sim/mobs';
import { NO_INPUT, type Bullet, type World } from '../../src/sim/types';
import { debugGiveLetter, step } from '../../src/sim/world';
import { ownsWord, useWord, WORDS } from '../../src/sim/words';
import { isolate, run, testWorld } from './helpers';

function setup(...words: string[]): World {
  const w = testWorld(6, 3);
  isolate(w);
  for (const word of words) for (const ch of word) debugGiveLetter(w, 0, ch);
  return w;
}

const say = (word: string) => ({ ...NO_INPUT, word });
const NEW_WORDS = ['PUSH', 'BOUNCE', 'FREEZE', 'ERASE', 'VOID', 'SQUIRT', 'DISARM', 'QUICK', 'LIFE', 'ZAP', 'WHIRL', 'FLIP', 'MAGNET', 'JETPACK', 'EXILE', 'XRAY'];

const shot = (w: World, owner: number, x: number, y: number, vx: number, vy: number, extra: Partial<Bullet> = {}): Bullet => {
  const b: Bullet = { id: w.nextId++, owner, copyId: w.players[owner].active!, x, y, vx, vy, r: 5, dmg: 10, life: 2, capital: false, ...extra };
  w.bullets.push(b);
  return b;
};
const still = (w: World, hp = 1000, x = 4000, y = 4000) => {
  const m = makeMob(w, '#', x, y);
  m.hp = hp;
  m.speed = 0;
  w.players[0].x = 3500; // mobs despawn when no player is near
  w.players[0].y = 4000;
  w.mobs.push(m);
  return m;
};

describe('new word powers', () => {
  it('every new word is in the table and starts when its letters are owned', () => {
    for (const word of NEW_WORDS) {
      expect(WORDS.some((d) => d.word === word), word).toBe(true);
      const w = setup(word);
      const p = w.players[0];
      expect(ownsWord(w, p, word), word + ' letters available').toBe(true);
      expect(useWord(w, p, word), word).toBe(true);
      expect(p.wordCd[word]).toBeGreaterThan(0);
      expect(p.spawnProt, word + ' immunity').toBeGreaterThanOrEqual(WORD_IMMUNITY);
    }
  });

  it('timed words last exactly their duration', () => {
    const w = setup('QUICK');
    const p = w.players[0];
    step(w, { 0: say('QUICK') });
    expect(p.fx.speed).toBeGreaterThan(SPEED.duration - 0.1);
    run(w, Math.ceil(SPEED.duration * 30));
    expect(p.fx.speed).toBeCloseTo(0, 6);
  });

  it('BOUNCE reflects off the map edge and off a target, and runs out', () => {
    const w = setup();
    const wall = shot(w, 0, 6, 4000, -540, 0, { bounce: 1 });
    run(w, 2);
    expect(wall.vx).toBeGreaterThan(0);
    const m = still(w, 1000, 4000, 2000);
    const hit = shot(w, 0, 3960, 2000, 540, 0, { bounce: 1 });
    run(w, 3);
    expect(m.hp).toBeLessThan(1000);
    expect(hit.vx).toBeLessThan(0);
    const spent = shot(w, 0, 6, 3000, -540, 0, { bounce: 0 });
    run(w, 2);
    expect(w.bullets.includes(spent)).toBe(false);
  });

  it('PUSH shoves mobs and enemies in range straight away, leaves far ones', () => {
    const w = setup('PUSH');
    const p = w.players[0];
    const q = w.players[1];
    q.x = p.x + 100;
    q.y = p.y;
    const near = still(w, 1000, p.x + 300, p.y);
    const far = still(w, 1000, p.x + 900, p.y);
    p.x = 3500;
    p.y = 4000;
    q.x = 3600;
    q.y = 4000;
    near.x = 3800;
    near.y = 4000;
    far.x = 4400;
    far.y = 4000;
    expect(useWord(w, p, 'PUSH')).toBe(true);
    expect(q.x).toBeCloseTo(3600 + PUSH.dist);
    expect(near.x).toBeCloseTo(3800 + PUSH.dist);
    expect(far.x).toBe(4400);
    expect(p.x).toBe(3500);
  });

  it('FREEZE slows 5% per bullet up to 20% and wears off after 1.5 s', () => {
    const w = setup();
    const m = still(w);
    shot(w, 0, 3960, 4000, 540, 0, { freeze: true });
    run(w, 2);
    expect(m.slow).toBeCloseTo(FREEZE.perHit);
    for (let i = 0; i < 6; i++) {
      shot(w, 0, 3960, 4000, 540, 0, { freeze: true });
      run(w, 2);
    }
    expect(m.slow).toBeCloseTo(FREEZE.max);
    run(w, Math.ceil(FREEZE.slowTime * 30) + 2);
    expect(m.slow).toBe(0);
  });

  it('ERASE removes enemy bullets inside the radius and keeps its own', () => {
    const w = setup();
    const p = w.players[0];
    p.fx.erase = 8;
    const enemy = shot(w, 1, p.x + 100, p.y, 0, 0);
    const own = shot(w, 0, p.x + 100, p.y + 50, 0, 0);
    const far = shot(w, 1, p.x + 600, p.y, 0, 0);
    run(w, 1);
    expect(w.bullets.includes(enemy)).toBe(false);
    expect(w.bullets.includes(own)).toBe(true);
    expect(w.bullets.includes(far)).toBe(true);
  });

  it('VOID waits 2 s, then pulls; an edge player walking away escapes, a central one is swallowed', () => {
    const w = setup();
    const [, centre, edge] = w.players;
    const cx = 3000;
    const cy = 3000;
    centre.x = cx + 60;
    centre.y = cy;
    edge.x = cx + VOID.radius - 20;
    edge.y = cy;
    w.voids.push({ id: 900, owner: 0, x: cx, y: cy, t: 0 });
    const away = { ...NO_INPUT, mx: 1 };
    run(w, Math.floor(VOID.arm * 30) - 2, { 2: away });
    expect(centre.x).toBe(cx + 60); // still arming: nobody is pulled
    run(w, 40, { 2: away });
    expect(centre.x).toBeLessThan(cx + 60);
    run(w, 150, { 2: away });
    expect(centre.lives).toBeLessThan(3);
    expect(edge.lives).toBe(3);
    expect(w.voids.length).toBe(0);
  });

  it('DISARM stops the hit player firing for 2 s and does not stack', () => {
    const w = setup();
    const q = w.players[1];
    shot(w, 0, q.x - 40, q.y, 540, 0, { disarm: true });
    run(w, 3);
    expect(q.disarmT).toBeGreaterThan(DISARM.lock - 0.2);
    shot(w, 0, q.x - 40, q.y, 540, 0, { disarm: true });
    run(w, 2);
    expect(q.disarmT).toBeLessThanOrEqual(DISARM.lock);
    w.bullets = [];
    q.fireTimer = 0;
    run(w, 10);
    expect(w.bullets.some((b) => b.owner === 1)).toBe(false);
    run(w, Math.ceil(DISARM.lock * 30));
    expect(q.disarmT).toBe(0);
    q.fireTimer = 0;
    run(w, 2);
    expect(w.bullets.some((b) => b.owner === 1)).toBe(true);
  });

  it('SPEED makes the player 35% faster', () => {
    const w = setup();
    const p = w.players[0];
    p.x = 1000;
    step(w, { 0: { ...NO_INPUT, mx: 1 } });
    const base = p.x - 1000;
    p.x = 1000;
    p.fx.speed = 5;
    step(w, { 0: { ...NO_INPUT, mx: 1 } });
    expect((p.x - 1000) / base).toBeCloseTo(SPEED.mul, 2);
  });

  it('LIFE refills HP to full', () => {
    const w = setup('LIFE');
    const p = w.players[0];
    p.hp = 5;
    expect(useWord(w, p, 'LIFE')).toBe(true);
    expect(p.hp).toBe(p.maxHp);
  });

  it('SPLASH inks the other living players only', () => {
    const w = setup('SQUIRT');
    expect(useWord(w, w.players[0], 'SQUIRT')).toBe(true);
    expect(w.players[0].splashT).toBe(0);
    expect(w.players[1].splashT).toBeGreaterThan(0);
  });

  it('ZAP chains a hit to nearby targets for reduced damage', () => {
    const w = setup();
    const a = still(w, 1000, 4000, 4000);
    const b = still(w, 1000, 4100, 4000);
    const c = still(w, 1000, 4200, 4000);
    const far = still(w, 1000, 4800, 4000);
    shot(w, 0, 3960, 4000, 540, 0, { zap: true });
    run(w, 2);
    expect(a.hp).toBe(990);
    expect(b.hp).toBeCloseTo(1000 - 10 * ZAP.dmgMul);
    expect(c.hp).toBeCloseTo(1000 - 10 * ZAP.dmgMul);
    expect(far.hp).toBe(1000);
  });

  it('FLIP mirrors the bullet directions top-to-bottom', () => {
    const volley = (flip: boolean) => {
      const w = setup();
      const p = w.players[0];
      p.fx.flip = flip ? 5 : 0;
      p.fireTimer = 0;
      step(w, { 0: NO_INPUT });
      return w.bullets.filter((b) => b.owner === 0).map((b) => [Math.round(b.vx), Math.round(b.vy)]);
    };
    const normal = volley(false);
    const flipped = volley(true);
    expect(normal.length).toBeGreaterThan(0);
    const key = (v: number[]) => v.join(',');
    const mirror = normal.map(([x, y]) => [x, y === 0 ? 0 : -y]);
    expect(flipped.map(key).sort()).toEqual(mirror.map(key).sort());
  });

  it('SPIN turns the pattern over time', () => {
    const dirs = (spin: number) => {
      const w = setup();
      const p = w.players[0];
      p.fx.spin = spin;
      p.fireTimer = 0;
      step(w, { 0: NO_INPUT });
      return w.bullets.filter((b) => b.owner === 0).map((b) => Math.round(Math.atan2(b.vy, b.vx) * 100));
    };
    expect(dirs(8).length).toBeGreaterThan(0);
    expect(dirs(8)).not.toEqual(dirs(7));
  });

  it('MAGNET pulls ground letters toward the player', () => {
    const w = setup();
    const p = w.players[0];
    const mine = new Set(p.letters.map((id) => w.copies[id].letter));
    const c = w.copies.find((k) => k.state === 'pool' && !mine.has(k.letter))!;
    c.state = 'ground';
    c.x = p.x + 600;
    c.y = p.y;
    run(w, 5);
    expect(c.x).toBe(p.x + 600);
    p.fx.magnet = 5;
    run(w, 5);
    expect(c.x).toBeLessThan(p.x + 600 - (MAGNET.speed * 4) / 30);
  });
});

describe('JETPACK, EXILE, XRAY', () => {
  it('JETPACK spins, fires 2.5x faster and drifts the player', () => {
    const base = setup('JETPACK');
    const jet = setup('JETPACK');
    jet.players[0].x = base.players[0].x = 4000;
    jet.players[0].y = base.players[0].y = 4000;
    step(jet, { 0: say('JETPACK') });
    expect(jet.players[0].fx.jet).toBeGreaterThan(JET.duration - 0.1);
    const shots = (w: World) => {
      w.players[0].fireTimer = 0;
      let n = 0;
      for (let i = 0; i < 60; i++) {
        step(w, {});
        n += w.events.filter((e) => e.t === 'shot' && e.owner === 0).length;
      }
      return n;
    };
    const nBase = shots(base);
    const nJet = shots(jet);
    expect(nJet / nBase).toBeGreaterThan(2.2);
    const p = jet.players[0];
    expect(Math.hypot(p.x - 4000, p.y - 4000)).toBeGreaterThan(5);
  });

  it('EXILE teleports only players in view, far away', () => {
    const w = testWorld(6, 3);
    isolate(w);
    for (const ch of 'EXILE') debugGiveLetter(w, 0, ch);
    const [a, near, far] = w.players;
    a.x = 4000;
    a.y = 4000;
    near.x = 4300;
    near.y = 4100;
    far.x = 5500;
    far.y = 4000;
    expect(useWord(w, a, 'EXILE')).toBe(true);
    expect(Math.hypot(near.x - a.x, near.y - a.y)).toBeGreaterThanOrEqual(EXILE.minDist * 0.9);
    expect(far.x).toBe(5500);
  });

  it('XRAY fires piercing lasers from X, then returns to the old letter', () => {
    const w = setup('XRAY');
    const p = w.players[0];
    p.x = 4000;
    p.y = 4000;
    const before = w.copies[p.active!].letter;
    step(w, { 0: { ...say('XRAY'), wordBack: before } });
    expect(w.copies[p.active!].letter).toBe('X');
    run(w, 10);
    const lasers = w.bullets.filter((b) => b.owner === 0 && b.laser);
    expect(lasers.length).toBeGreaterThan(0);
    expect(lasers.every((b) => b.pierce && b.life > 5)).toBe(true);
    run(w, Math.ceil(XRAY.duration * 30));
    expect(w.copies[p.active!].letter).toBe(before);
  });
});
