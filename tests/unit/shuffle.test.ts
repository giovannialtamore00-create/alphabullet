import { describe, expect, it } from 'vitest';
import { SHUFFLE } from '../../src/sim/config';
import { NO_INPUT } from '../../src/sim/types';
import { debugGiveLetter, step } from '../../src/sim/world';
import { isolate, testWorld } from './helpers';

describe('duplicate letter shuffle', () => {
  it('shuffles into a missing letter after 3 s and needs a second pass to collect', () => {
    const w = testWorld(6);
    isolate(w);
    for (const ch of 'BO') debugGiveLetter(w, 0, ch);
    const p = w.players[0];
    const dup = w.copies.find((c) => c.state === 'pool' && c.letter === 'B')!;
    dup.state = 'ground';
    dup.wave = true;
    dup.x = p.x;
    dup.y = p.y;
    const owned = p.letters.length;
    step(w, { 0: NO_INPUT });
    expect(dup.shuffle).toBeGreaterThan(0);
    expect(p.letters.length).toBe(owned); // nothing collected
    for (let i = 0; i < Math.ceil(SHUFFLE.time * 60) + 2; i++) step(w, { 0: NO_INPUT });
    expect(dup.state).toBe('pool');
    const fresh = w.copies.find((c) => c.state === 'ground' && c.lockFor === 0)!;
    expect(fresh).toBeDefined();
    expect(['B', 'O']).not.toContain(fresh.letter);
    expect(p.letters.length).toBe(owned); // standing on it does not collect it
    p.x += 300;
    step(w, { 0: NO_INPUT });
    expect(fresh.lockFor).toBe(-1);
    p.x = fresh.x;
    p.y = fresh.y;
    step(w, { 0: NO_INPUT });
    expect(fresh.state).toBe('owned');
    expect(p.letters.length).toBe(owned + 1);
  });
});
