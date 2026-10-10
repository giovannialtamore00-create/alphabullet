/**
 * Glyph data: every letter (lowercase + CAPITAL) and every mob symbol, as stroke paths.
 * Coordinates: unit box [-0.5, 0.5], x right, y DOWN. Angles in degrees, 0 = right, 90 = down.
 * Emitters, collision and bullet stats are DERIVED from these strokes (see glyphDerive.ts).
 * Shield arcs are marked here explicitly (only shield letters O, D, B, C, Q have them).
 */

export interface Pt {
  x: number;
  y: number;
}
export interface Stroke {
  pts: Pt[];
  /** Arc center if the stroke starts/ends on an arc (used for terminal direction). */
  startArc?: Pt;
  endArc?: Pt;
}
export interface ShieldArc {
  cx: number;
  cy: number;
  r: number;
  facing: number; // degrees
  width: number; // degrees
}
export interface GlyphForm {
  strokes: Stroke[];
  shields: ShieldArc[];
}
export interface LetterGlyph {
  lower: GlyphForm;
  upper: GlyphForm;
  desc: string;
  /** Pure shield letters (B, D, O) do not shoot; only C and Q, which have stroke ends, do. */
  noShoot?: boolean | 'capital'; // true: never fires; 'capital': only the CAPITAL form is silent
}

type Part =
  | { kind: 'l'; xy: number[] }
  | { kind: 'a'; cx: number; cy: number; r: number; a0: number; a1: number };

const l = (...xy: number[]): Part => ({ kind: 'l', xy });
const a = (cx: number, cy: number, r: number, a0: number, a1: number): Part => ({
  kind: 'a',
  cx,
  cy,
  r,
  a0,
  a1,
});
const D2R = Math.PI / 180;

/** Build one continuous stroke from line and arc parts. */
function S(...parts: Part[]): Stroke {
  const pts: Pt[] = [];
  const push = (x: number, y: number) => {
    const last = pts[pts.length - 1];
    if (!last || Math.hypot(last.x - x, last.y - y) > 1e-6) pts.push({ x, y });
  };
  const s: Stroke = { pts };
  parts.forEach((p, i) => {
    if (p.kind === 'l') {
      for (let k = 0; k < p.xy.length; k += 2) push(p.xy[k], p.xy[k + 1]);
    } else {
      const steps = Math.max(2, Math.ceil(Math.abs(p.a1 - p.a0) / 10));
      for (let k = 0; k <= steps; k++) {
        const ang = (p.a0 + ((p.a1 - p.a0) * k) / steps) * D2R;
        push(p.cx + p.r * Math.cos(ang), p.cy + p.r * Math.sin(ang));
      }
      if (i === 0) s.startArc = { x: p.cx, y: p.cy };
      if (i === parts.length - 1) s.endArc = { x: p.cx, y: p.cy };
    }
  });
  return s;
}

/** Shield arc from an arc's geometry. */
function sh(cx: number, cy: number, r: number, a0: number, a1: number): ShieldArc {
  return { cx, cy, r, facing: (((a0 + a1) / 2) % 360 + 360) % 360, width: Math.abs(a1 - a0) };
}

const F = (strokes: Stroke[], shields: ShieldArc[] = []): GlyphForm => ({ strokes, shields });

export const LETTERS: Record<string, LetterGlyph> = {
  A: {
    desc: 'Two legs fire straight down.',
    lower: F([S(a(-0.04, 0.12, 0.24, 0, 360)), S(l(0.2, -0.2, 0.2, 0.38))]),
    upper: F([S(l(-0.38, 0.5, 0, -0.5, 0.38, 0.5)), S(l(-0.22, 0.1, 0.22, 0.1))]),
  },
  B: {
    desc: 'Shield letter: bowl guards the right side; lowercase fires from both ends of its stem, CAPITAL does not shoot.',
    noShoot: 'capital',
    lower: F([S(l(-0.25, -0.5, -0.25, 0.45)), S(a(0, 0.2, 0.25, 0, 360))], [sh(0, 0.2, 0.25, -90, 90)]),
    upper: F(
      [
        S(l(-0.3, -0.5, -0.3, 0.5)),
        S(l(-0.3, -0.5, 0.02, -0.5), a(0.02, -0.26, 0.24, -90, 90), l(0.02, -0.02, -0.3, -0.02)),
        S(l(-0.3, -0.02, 0.06, -0.02), a(0.06, 0.24, 0.26, -90, 90), l(0.06, 0.5, -0.3, 0.5)),
      ],
      [sh(0.02, -0.26, 0.24, -90, 90), sh(0.06, 0.24, 0.26, -90, 90)],
    ),
  },
  C: {
    desc: 'Shield letter: guards the back, fires out of its opening.',
    lower: F([S(a(0.05, 0.05, 0.32, 45, 315))], [sh(0.05, 0.05, 0.32, 45, 315)]),
    upper: F([S(a(0.05, 0, 0.45, 45, 315))], [sh(0.05, 0, 0.45, 45, 315)]),
  },
  D: {
    desc: 'Shield letter: strong one-sided shield on its curve; lowercase fires from both ends of its stem, CAPITAL does not shoot.',
    noShoot: 'capital',
    lower: F([S(a(-0.05, 0.2, 0.25, 0, 360)), S(l(0.2, -0.5, 0.2, 0.45))], [sh(-0.05, 0.2, 0.25, 90, 270)]),
    upper: F(
      [S(l(-0.3, -0.5, -0.3, 0.5)), S(l(-0.3, -0.5, -0.05, -0.5), a(-0.05, 0, 0.5, -90, 90), l(-0.05, 0.5, -0.3, 0.5))],
      [sh(-0.05, 0, 0.5, -90, 90)],
    ),
  },
  E: {
    desc: 'All prongs fire right.',
    lower: F([S(l(-0.27, 0.1, 0.27, 0.1)), S(a(0, 0.1, 0.27, 0, -315))]),
    upper: F([S(l(0.32, -0.5, -0.3, -0.5, -0.3, 0.5, 0.32, 0.5)), S(l(-0.3, 0, 0.22, 0))]),
  },
  F: {
    desc: 'Fires right from its arms and down from its stem.',
    lower: F([S(l(-0.08, 0.5, -0.08, -0.28), a(0.1, -0.28, 0.18, 180, 320)), S(l(-0.28, -0.05, 0.2, -0.05))]),
    upper: F([S(l(0.32, -0.5, -0.3, -0.5, -0.3, 0.5)), S(l(-0.3, 0, 0.22, 0))]),
  },
  G: {
    desc: 'Hook fires right, spur fires left.',
    lower: F([S(a(0, -0.15, 0.22, 0, 360)), S(l(0.22, -0.38, 0.22, 0.25), a(0, 0.25, 0.22, 0, 160))]),
    upper: F([S(a(0, 0, 0.45, -45, -360), l(0.45, 0, 0.12, 0))]),
  },
  H: {
    desc: 'Two posts fire up and down.',
    lower: F([S(l(-0.25, -0.5, -0.25, 0.5)), S(a(0, 0.05, 0.25, 180, 360), l(0.25, 0.05, 0.25, 0.5))]),
    upper: F([S(l(-0.32, -0.5, -0.32, 0.5)), S(l(0.32, -0.5, 0.32, 0.5)), S(l(-0.32, 0, 0.32, 0))]),
  },
  I: {
    desc: 'Lowercase: dot fires up, foot fires down. Capital serifs fire sideways.',
    lower: F([S(l(0, -0.12, 0, 0.5)), S(l(0, -0.4, 0, -0.32))]),
    upper: F([S(l(0, -0.5, 0, 0.5)), S(l(-0.22, -0.5, 0.22, -0.5)), S(l(-0.22, 0.5, 0.22, 0.5))]),
  },
  J: {
    desc: 'Fires up from the top and back from its hook.',
    lower: F([S(l(0.08, -0.12, 0.08, 0.3), a(-0.12, 0.3, 0.2, 0, 160)), S(l(0.08, -0.4, 0.08, -0.32))]),
    upper: F([S(l(0.2, -0.5, 0.2, 0.2), a(-0.05, 0.2, 0.25, 0, 160))]),
  },
  K: {
    desc: 'Stem fires up/down, arms fire diagonally right.',
    lower: F([S(l(-0.22, -0.5, -0.22, 0.5)), S(l(0.22, -0.12, -0.22, 0.2)), S(l(-0.04, 0.07, 0.25, 0.5))]),
    upper: F([S(l(-0.3, -0.5, -0.3, 0.5)), S(l(0.32, -0.5, -0.3, 0.05)), S(l(-0.12, -0.1, 0.34, 0.5))]),
  },
  L: {
    desc: 'Lowercase: up and down. Capital: up and right.',
    lower: F([S(l(0, -0.5, 0, 0.5))]),
    upper: F([S(l(-0.3, -0.5, -0.3, 0.5, 0.32, 0.5))]),
  },
  M: {
    desc: 'Lowercase: fork of three feet firing down. Capital: two wide legs down.',
    lower: F([
      S(l(-0.38, -0.2, -0.38, 0.5)),
      S(a(-0.19, 0.05, 0.19, 180, 360), l(0, 0.05, 0, 0.5)),
      S(a(0.19, 0.05, 0.19, 180, 360), l(0.38, 0.05, 0.38, 0.5)),
    ]),
    upper: F([S(l(-0.4, 0.5, -0.36, -0.5, 0, 0.2, 0.36, -0.5, 0.4, 0.5))]),
  },
  N: {
    desc: 'Fires down on one side, up on the other.',
    lower: F([S(l(-0.25, -0.2, -0.25, 0.5)), S(a(0, 0.05, 0.25, 180, 360), l(0.25, 0.05, 0.25, 0.5))]),
    upper: F([S(l(-0.32, 0.5, -0.32, -0.5, 0.32, 0.5, 0.32, -0.5))]),
  },
  O: {
    desc: 'Shield letter: all-round shield. Does not shoot.',
    noShoot: true,
    lower: F([S(a(0, 0.05, 0.3, 0, 360))], [sh(0, 0.05, 0.3, 0, 360)]),
    upper: F([S(a(0, 0, 0.45, 0, 360))], [sh(0, 0, 0.45, 0, 360)]),
  },
  P: {
    desc: 'Lowercase: up and down. Capital: one heavy shot down.',
    lower: F([S(l(-0.25, -0.25, -0.25, 0.5)), S(a(0, 0, 0.25, 0, 360))]),
    upper: F([S(l(-0.3, 0.5, -0.3, -0.5, 0, -0.5), a(0, -0.24, 0.26, -90, 90), l(0, 0.02, -0.3, 0.02))]),
  },
  Q: {
    desc: 'Shield letter: all-round shield plus a tail shot.',
    lower: F([S(a(-0.03, -0.05, 0.25, 0, 360)), S(l(0.22, -0.3, 0.22, 0.5))], [sh(-0.03, -0.05, 0.25, 90, 270)]),
    upper: F([S(a(0, 0, 0.45, 0, 360)), S(l(0.318, 0.318, 0.52, 0.52))], [sh(0, 0, 0.45, 0, 360)]),
  },
  R: {
    desc: 'Fires down and from its arm or leg.',
    lower: F([S(l(-0.18, -0.2, -0.18, 0.5)), S(a(0.07, 0.05, 0.25, 180, 300))]),
    upper: F([
      S(l(-0.3, 0.5, -0.3, -0.5, 0, -0.5), a(0, -0.24, 0.26, -90, 90), l(0, 0.02, -0.3, 0.02)),
      S(l(-0.05, 0.02, 0.36, 0.5)),
    ]),
  },
  S: {
    desc: 'Fires right from the top and left from the bottom.',
    lower: F([S(a(0, -0.17, 0.18, 330, 90), a(0, 0.19, 0.18, 270, 510))]),
    upper: F([S(a(0, -0.25, 0.25, 330, 90), a(0, 0.25, 0.25, 270, 510))]),
  },
  T: {
    desc: 'Arms fire sideways, stem fires down.',
    lower: F([S(l(-0.02, -0.45, -0.02, 0.3), a(0.13, 0.3, 0.15, 180, 60)), S(l(-0.25, -0.12, 0.22, -0.12))]),
    upper: F([S(l(-0.4, -0.5, 0.4, -0.5)), S(l(0, -0.5, 0, 0.5))]),
  },
  U: {
    desc: 'Cup fires upward.',
    lower: F([S(l(-0.25, -0.2, -0.25, 0.05), a(0, 0.05, 0.25, 180, 0)), S(l(0.25, -0.2, 0.25, 0.5))]),
    upper: F([S(l(-0.32, -0.5, -0.32, 0.12), a(0, 0.12, 0.32, 180, 0), l(0.32, 0.12, 0.32, -0.5))]),
  },
  V: {
    desc: 'Fires diagonally up-left and up-right.',
    lower: F([S(l(-0.35, -0.2, 0, 0.4, 0.35, -0.2))]),
    upper: F([S(l(-0.45, -0.5, 0, 0.5, 0.45, -0.5))]),
  },
  W: {
    desc: 'Two outer arms fire up.',
    lower: F([S(l(-0.45, -0.2, -0.22, 0.4, 0, 0, 0.22, 0.4, 0.45, -0.2))]),
    upper: F([S(l(-0.48, -0.5, -0.24, 0.5, 0, -0.1, 0.24, 0.5, 0.48, -0.5))]),
  },
  X: {
    desc: 'Four diagonal ends fire diagonally.',
    lower: F([S(l(-0.3, -0.25, 0.3, 0.4)), S(l(0.3, -0.25, -0.3, 0.4))]),
    upper: F([S(l(-0.4, -0.5, 0.4, 0.5)), S(l(0.4, -0.5, -0.4, 0.5))]),
  },
  Y: {
    desc: 'Arms fire diagonally up, tail fires down.',
    lower: F([S(l(-0.32, -0.25, 0.025, 0.22)), S(l(0.32, -0.25, -0.15, 0.5))]),
    upper: F([S(l(-0.4, -0.5, 0, 0)), S(l(0.4, -0.5, 0, 0)), S(l(0, 0, 0, 0.5))]),
  },
  Z: {
    desc: 'Top fires left, bottom fires right.',
    lower: F([S(l(-0.28, -0.2, 0.28, -0.2, -0.28, 0.4, 0.28, 0.4))]),
    upper: F([S(l(-0.35, -0.5, 0.35, -0.5, -0.35, 0.5, 0.35, 0.5))]),
  },
};

export const LETTER_KEYS = Object.keys(LETTERS);

export type MobTierName = 'slender' | 'medium' | 'chunky';
export interface MobGlyph {
  strokes: Stroke[];
  tier: MobTierName;
}

/** Keyboard-symbol mobs. Data-driven: new effects can be added per entry later. */
export const MOBS: Record<string, MobGlyph> = {
  '/': { tier: 'slender', strokes: [S(l(0.3, -0.5, -0.3, 0.5))] },
  '(': { tier: 'slender', strokes: [S(a(0.45, 0, 0.6, 145, 215))] },
  ')': { tier: 'slender', strokes: [S(a(-0.45, 0, 0.6, -35, 35))] },
  '!': { tier: 'slender', strokes: [S(l(0, -0.5, 0, 0.2)), S(l(0, 0.38, 0, 0.48))] },
  '|': { tier: 'slender', strokes: [S(l(0, -0.5, 0, 0.5))] },
  '%': {
    tier: 'medium',
    strokes: [S(a(-0.22, -0.25, 0.13, 0, 360)), S(a(0.22, 0.25, 0.13, 0, 360)), S(l(0.3, -0.45, -0.3, 0.45))],
  },
  '=': { tier: 'medium', strokes: [S(l(-0.35, -0.15, 0.35, -0.15)), S(l(-0.35, 0.15, 0.35, 0.15))] },
  '"': { tier: 'medium', strokes: [S(l(-0.15, -0.3, -0.15, 0.3)), S(l(0.15, -0.3, 0.15, 0.3))] },
  '?': {
    tier: 'medium',
    strokes: [S(a(0, -0.2, 0.26, 200, 450), l(0, 0.06, 0, 0.22)), S(l(0, 0.38, 0, 0.48))],
  },
  '#': {
    tier: 'chunky',
    strokes: [
      S(l(-0.12, -0.5, -0.22, 0.5)),
      S(l(0.22, -0.5, 0.12, 0.5)),
      S(l(-0.42, -0.17, 0.42, -0.17)),
      S(l(-0.42, 0.17, 0.42, 0.17)),
    ],
  },
  '@': {
    tier: 'chunky',
    strokes: [S(a(0.02, 0.02, 0.15, 0, 360)), S(l(0.17, -0.15, 0.17, 0.15), a(0, 0, 0.45, 20, -300))],
  },
  '£': {
    tier: 'chunky',
    strokes: [
      S(a(0.08, -0.22, 0.24, 340, 180), l(-0.16, 0.5)),
      S(l(-0.38, 0.5, 0.36, 0.5)),
      S(l(-0.38, 0.05, 0.16, 0.05)),
    ],
  },
  $: {
    tier: 'chunky',
    strokes: [S(a(0, -0.2, 0.22, 330, 90), a(0, 0.24, 0.22, 270, 510)), S(l(0, -0.56, 0, 0.56))],
  },
  '&': {
    tier: 'chunky',
    strokes: [
      S(a(-0.02, -0.28, 0.17, 0, 360)),
      S(l(-0.12, -0.13, 0.38, 0.5)),
      S(a(-0.05, 0.22, 0.25, 225, 20), l(0.38, -0.02)),
    ],
  },
};

export const MOB_KEYS = Object.keys(MOBS);
