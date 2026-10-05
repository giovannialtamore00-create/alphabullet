import { describe, expect, it } from 'vitest';
import { deriveEmitters, deriveForm, dirLabel, getForm } from '../../src/sim/glyphDerive';
import { LETTER_KEYS, LETTERS } from '../../src/sim/glyphs';
import { BULLET } from '../../src/sim/config';

const dirs = (letter: string, cap: boolean) =>
  getForm(letter, cap).emitters.map((e) => dirLabel(e.dx, e.dy)).sort().join(',');

describe('glyph data and derivation', () => {
  it('has all 26 letters with both forms', () => {
    expect(LETTER_KEYS).toHaveLength(26);
    for (const k of LETTER_KEYS) {
      expect(LETTERS[k].lower.strokes.length).toBeGreaterThan(0);
      expect(LETTERS[k].upper.strokes.length).toBeGreaterThan(0);
    }
  });

  it('matches the spec examples', () => {
    expect(dirs('A', true)).toBe('S,S');
    expect(dirs('T', true)).toBe('E,S,W');
    expect(dirs('X', true)).toBe('NE,NW,SE,SW');
  });

  it('every form can fire', () => {
    for (const k of LETTER_KEYS) for (const cap of [false, true]) expect(getForm(k, cap).emitters.length).toBeGreaterThan(0);
  });

  it('emitters sit on free stroke ends, not on joints', () => {
    // T: the stem top touches the bar, so it is not an emitter.
    const t = getForm('T', true);
    expect(t.emitters.some((e) => Math.abs(e.x) < 0.01 && e.y < -0.4)).toBe(false);
  });

  it('is derived from data: changing strokes changes the weapon', () => {
    const custom = deriveEmitters([{ pts: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }] }]);
    expect(custom.map((e) => dirLabel(e.dx, e.dy)).sort()).toEqual(['E', 'W']);
  });

  it('shield letters O, D, B have shields; O is all-round with the lowest cap', () => {
    const O = getForm('O', true), D = getForm('D', true), B = getForm('B', true);
    expect(O.shieldCoverage).toBe(1);
    expect(D.shieldCoverage).toBeCloseTo(0.5, 1);
    expect(B.shieldCoverage).toBeCloseTo(0.5, 1);
    expect(O.shieldCap).toBeLessThan(D.shieldCap);
    expect(O.shieldCap).toBeLessThan(B.shieldCap);
    expect(getForm('D', false).shieldCap).toBeGreaterThan(getForm('O', false).shieldCap);
  });

  it('non-shield letters have no shield', () => {
    for (const k of 'AEFHIKLMNPRSTUVWXYZ') expect(getForm(k, false).shieldCap).toBe(0);
  });

  it('capital forms hit harder and shields get stronger', () => {
    for (const k of LETTER_KEYS) {
      const lo = getForm(k, false), up = getForm(k, true);
      const dps = (f: typeof lo) => f.bullet.dmg * f.bullet.rate * f.emitters.length;
      expect(dps(up)).toBeGreaterThan(dps(lo));
      expect(up.bullet.radius).toBeGreaterThan(lo.bullet.radius);
      if (lo.shieldCap) expect(up.shieldCap).toBeGreaterThan(lo.shieldCap);
    }
  });

  it('more emitters means weaker bullets, total output stays in a band', () => {
    for (const k of LETTER_KEYS) {
      const f = getForm(k, false);
      if (f.shieldCap) continue;
      const total = f.bullet.dmg * f.bullet.rate * f.emitters.length;
      expect(total).toBeGreaterThanOrEqual(BULLET.baseDps - 0.01);
      expect(total).toBeLessThanOrEqual(BULLET.baseDps * 1.5);
    }
    expect(getForm('X', false).bullet.dmg).toBeLessThan(getForm('E', false).bullet.dmg);
  });

  it('deriveForm works on any glyph form', () => {
    const f = deriveForm('Z', LETTERS.Z.upper, true);
    expect(f.emitters.length).toBe(2);
  });
});
