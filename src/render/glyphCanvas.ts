/** Draws stroke-path glyphs onto a 2D canvas in an inky style. Shared by the game renderer and the HUD. */
import type { Stroke } from '../sim/glyphs';

export const INK = '#1b1a19';
export const PAPER = '#f3eee2';

export function strokeGlyph(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  cx: number,
  cy: number,
  size: number,
  color = INK,
  width = 0.11,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  // Two passes: a slightly wider faint pass gives a soaked-ink edge.
  for (const [w, a] of [
    [width * 1.25, 0.25],
    [width, 1],
  ] as const) {
    ctx.globalAlpha = a;
    ctx.lineWidth = w * size;
    for (const s of strokes) {
      ctx.beginPath();
      s.pts.forEach((p, i) => (i ? ctx.lineTo(cx + p.x * size, cy + p.y * size) : ctx.moveTo(cx + p.x * size, cy + p.y * size)));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** A square canvas (side = 1.6 x size x scale) with the glyph centered. */
export function glyphCanvas(strokes: Stroke[], size: number, scale = 2, color = '#ffffff', width = 0.11): HTMLCanvasElement {
  const side = Math.ceil(size * 1.6 * scale);
  const c = document.createElement('canvas');
  c.width = c.height = side;
  const ctx = c.getContext('2d')!;
  strokeGlyph(ctx, strokes, side / 2, side / 2, size * scale, color, width);
  return c;
}
