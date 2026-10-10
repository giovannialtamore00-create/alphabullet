/**
 * Cosmetic font skins. Purely visual: gameplay (emitters, range, shields) always comes from our
 * own stroke glyphs. Fonts are the player's installed system fonts (no font files are shipped);
 * missing ones fall back to lookalikes through the CSS font stack.
 */
import type { Stroke } from '../sim/glyphs';
import { strokeGlyph } from './glyphCanvas';

export interface FontSkin {
  id: string;
  label: string;
  stack: string; // CSS font-family list, best match first
}

export const INK_FONT = 'ink';

export const FONTS: FontSkin[] = [
  { id: INK_FONT, label: 'Ink (original)', stack: '' },
  { id: 'helvetica', label: 'Helvetica', stack: "Helvetica, 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif" },
  { id: 'arial', label: 'Arial', stack: "Arial, 'Liberation Sans', Helvetica, sans-serif" },
  { id: 'times', label: 'Times New Roman', stack: "'Times New Roman', Times, 'Liberation Serif', serif" },
  { id: 'comic', label: 'Comic Sans', stack: "'Comic Sans MS', 'Comic Sans', 'Comic Neue', 'Chalkboard SE', cursive" },
  { id: 'courier', label: 'Courier', stack: "'Courier New', Courier, 'Liberation Mono', monospace" },
  { id: 'papyrus', label: 'Papyrus', stack: "Papyrus, Herculanum, 'Segoe Script', fantasy" },
  { id: 'impact', label: 'Impact', stack: "Impact, Haettenschweiler, 'Arial Narrow Bold', 'Arial Black', sans-serif" },
  { id: 'chalkduster', label: 'Chalkduster', stack: "Chalkduster, Chalkboard, 'Segoe Print', 'Comic Sans MS', fantasy" },
];

export function fontById(id: string | undefined): FontSkin {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

/** Bounding box of our stroke glyph in unit coords (used to fit font glyphs to the same footprint). */
function strokeBox(strokes: Stroke[]) {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const s of strokes)
    for (const p of s.pts) {
      minx = Math.min(minx, p.x);
      maxx = Math.max(maxx, p.x);
      miny = Math.min(miny, p.y);
      maxy = Math.max(maxy, p.y);
    }
  return { minx, maxx, miny, maxy };
}

/**
 * Draw one letter in a skin onto ctx, centered at (cx, cy). Font glyphs are scaled to cover the
 * same box as our stroke glyph, so bullets still leave from where the letter visibly ends.
 */
export function drawSkinnedGlyph(
  ctx: CanvasRenderingContext2D,
  ch: string,
  strokes: Stroke[],
  font: string,
  cx: number,
  cy: number,
  size: number,
  color: string,
  width: number,
  bold: boolean,
): void {
  const skin = fontById(font);
  if (skin.id === INK_FONT) {
    strokeGlyph(ctx, strokes, cx, cy, size, color, width);
    return;
  }
  const box = strokeBox(strokes);
  const boxW = Math.max(0.2, box.maxx - box.minx) * size;
  const boxH = Math.max(0.2, box.maxy - box.miny) * size;
  const boxCx = cx + ((box.minx + box.maxx) / 2) * size;
  const boxCy = cy + ((box.miny + box.maxy) / 2) * size;
  const ref = 200;
  ctx.save();
  ctx.font = `${bold ? 'bold ' : ''}${ref}px ${skin.stack}`;
  const m = ctx.measureText(ch);
  const gw = Math.max(1, m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
  const gh = Math.max(1, m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
  // Fit by height; never let very wide glyphs spill far past the stroke footprint.
  const k = Math.min(boxH / gh, (boxW * 1.5) / gw);
  ctx.translate(boxCx, boxCy);
  ctx.scale(k, k);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.textBaseline = 'alphabetic';
  // Center the glyph's actual ink box on the stroke glyph's box.
  const ox = -(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2;
  const oy = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  ctx.fillText(ch, ox, oy);
  if (bold) {
    // Extra weight for BOLD letters even in fonts without a bold face.
    ctx.lineWidth = ref * 0.035;
    ctx.strokeText(ch, ox, oy);
  }
  ctx.restore();
}

/** Square canvas with the skinned glyph centered (mirrors glyphCanvas). */
export function skinnedGlyphCanvas(ch: string, strokes: Stroke[], font: string, size: number, scale: number, width: number, bold: boolean): HTMLCanvasElement {
  const side = Math.ceil(size * 1.6 * scale);
  const c = document.createElement('canvas');
  c.width = c.height = side;
  const ctx = c.getContext('2d')!;
  drawSkinnedGlyph(ctx, ch, strokes, font, side / 2, side / 2, size * scale, '#ffffff', width, bold);
  return c;
}

/** Remember the local player's choice between sessions. */
const KEY = 'alphabullet.font';
export function savedFont(): string {
  try {
    return fontById(localStorage.getItem(KEY) ?? undefined).id;
  } catch {
    return INK_FONT;
  }
}
export function saveFont(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}
