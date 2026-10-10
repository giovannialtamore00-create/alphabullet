/** Dev tool: how well does each system font line up with our shooting pattern? (not part of the game build) */
import { FONTS, INK_FONT, drawSkinnedGlyph } from '../src/render/fonts';
import { strokeGlyph } from '../src/render/glyphCanvas';
import { getForm } from '../src/sim/glyphDerive';
import { LETTER_KEYS } from '../src/sim/glyphs';

const S = 100; // px per unit
const SIDE = 160;

function inkAt(d: Uint8ClampedArray, x: number, y: number, r: number): boolean {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r * r) continue;
      const px = Math.round(x + dx), py = Math.round(y + dy);
      if (px < 0 || py < 0 || px >= SIDE || py >= SIDE) continue;
      if (d[(py * SIDE + px) * 4 + 3] > 100) return true;
    }
  return false;
}

function installed(stack: string): boolean {
  const first = stack.split(',')[0].trim();
  const c = document.createElement('canvas').getContext('2d')!;
  const probe = 'mmmmmmmmmmwwwwwlliiAaGg@#';
  const w = (f: string) => {
    c.font = `72px ${f}`;
    return c.measureText(probe).width;
  };
  return ['monospace', 'serif', 'sans-serif'].some((fb) => w(`${first}, ${fb}`) !== w(fb));
}

function render(draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = SIDE;
  const ctx = c.getContext('2d')!;
  draw(ctx);
  return { c, ctx, d: ctx.getImageData(0, 0, SIDE, SIDE).data };
}

const report: Record<string, unknown>[] = [];
const out = document.getElementById('out')!;
for (const f of FONTS) {
  if (f.id === INK_FONT) continue;
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.id = `sheet-${f.id}`;
  const title = document.createElement('h3');
  sheet.append(title);
  const row = document.createElement('div');
  sheet.append(row);
  out.append(sheet);
  let pass = 0, emitPass = 0, emitTotal = 0, iouSum = 0;
  const fails: string[] = [];
  for (const k of LETTER_KEYS)
    for (const cap of [false, true]) {
      const ch = cap ? k : k.toLowerCase();
      const form = getForm(k, cap);
      const strokes = form.glyph.strokes;
      const font = render((ctx) => drawSkinnedGlyph(ctx, ch, strokes, f.id, SIDE / 2, SIDE / 2, S, '#000', 0.11, false));
      const ours = render((ctx) => strokeGlyph(ctx, strokes, SIDE / 2, SIDE / 2, S, '#000', 0.14));
      let inter = 0, uni = 0;
      for (let i = 3; i < font.d.length; i += 4) {
        const a = font.d[i] > 100, b = ours.d[i] > 100;
        if (a && b) inter++;
        if (a || b) uni++;
      }
      iouSum += uni ? inter / uni : 0;
      let ok = true;
      const ctx = font.ctx;
      for (const e of form.emitters) {
        const x = SIDE / 2 + e.x * S, y = SIDE / 2 + e.y * S;
        const atEnd = inkAt(font.d, x, y, 8);
        const behind = inkAt(font.d, x - e.dx * 14, y - e.dy * 14, 6);
        const clear = !inkAt(font.d, x + e.dx * 16, y + e.dy * 16, 3) && !inkAt(font.d, x + e.dx * 28, y + e.dy * 28, 3);
        // Shield pulses leave a curve outward: there is no stroke "behind" them, only ink at the point.
        const good = form.emittersFromShield ? atEnd && clear : atEnd && behind && clear;
        emitTotal++;
        if (good) emitPass++;
        else ok = false;
        ctx.strokeStyle = good ? '#1a9a3a' : '#e02020';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + e.dx * 26, y + e.dy * 26);
        ctx.stroke();
      }
      if (ok) pass++;
      else fails.push(ch);
      font.c.style.width = font.c.style.height = '64px';
      font.c.style.border = `2px solid ${ok ? '#cfc' : '#fcc'}`;
      row.append(font.c);
    }
  const rec = { font: f.label, installed: installed(f.stack), lettersAligned: pass, of: 52, emittersAligned: `${emitPass}/${emitTotal}`, shapeOverlap: +(iouSum / 52).toFixed(2), misaligned: fails.join(' ') };
  report.push(rec);
  title.textContent = `${f.label}  installed=${rec.installed}  aligned ${pass}/52  emitters ${rec.emittersAligned}  overlap ${rec.shapeOverlap}`;
}
(window as unknown as { __fontReport: unknown }).__fontReport = report;
