import { describe, expect, it } from 'vitest';
import { MAX_PASSIVES } from '../../src/sim/config';
import { NO_INPUT, type World } from '../../src/sim/types';
import { step } from '../../src/sim/world';
import { useWord } from '../../src/sim/words';
import { debugGiveLetter } from '../../src/sim/world';
import { isolate, testWorld } from './helpers';

function setup(...words: string[]): World {
  const w = testWorld(6);
  isolate(w);
  for (const word of words) for (const ch of word) debugGiveLetter(w, 0, ch);
  return w;
}
const idle = (w: World, n: number) => { for (let i = 0; i < n; i++) step(w, { 0: NO_INPUT }); };

describe('passive word powers', () => {
  it('stay on with no timer and no cooldown', () => {
    const w = setup('PIERCE');
    const p = w.players[0];
    expect(useWord(w, p, 'PIERCE')).toBe(true);
    idle(w, 30 * 60);
    expect(p.fx.pierce).toBeGreaterThan(0);
    expect(p.wordCd.PIERCE ?? 0).toBe(0);
    expect(useWord(w, p, 'PIERCE')).toBe(false); // already on
  });

  it('a 4th passive removes the oldest', () => {
    const w = setup('PIERCE', 'BOUNCE', 'FREEZE', 'ZAP');
    const p = w.players[0];
    for (const x of ['PIERCE', 'BOUNCE', 'FREEZE', 'ZAP']) useWord(w, p, x);
    expect(p.passives).toEqual(['BOUNCE', 'FREEZE', 'ZAP']);
    expect(p.passives.length).toBe(MAX_PASSIVES);
    idle(w, 5);
    expect(p.fx.pierce).toBe(0);
    expect(p.fx.bounce).toBeGreaterThan(0);
  });

  it('switch off when a letter of the word is lost', () => {
    const w = setup('ZAP');
    const p = w.players[0];
    useWord(w, p, 'ZAP');
    const id = p.letters.find((i) => w.copies[i].letter === 'Z')!;
    p.letters = p.letters.filter((i) => i !== id);
    idle(w, 2);
    expect(p.fx.zap).toBe(0);
  });

  it('instant words are not passive', () => {
    const w = setup('BOMB');
    const p = w.players[0];
    useWord(w, p, 'BOMB');
    expect(p.passives).toEqual([]);
    expect(p.wordCd.BOMB).toBeGreaterThan(0);
  });
});
