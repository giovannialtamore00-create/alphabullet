/** Menu screens as DOM overlays: start, settings, pause, end, lobby/join (online in M7). Black ink on paper. */
import { audio } from '../audio/audio';
import { LETTERS } from '../sim/glyphs';
import type { World } from '../sim/types';
import { INK, strokeGlyph } from '../render/glyphCanvas';

const ui = () => document.getElementById('ui')!;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { cls?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { cls, ...rest } = props;
  if (cls) e.className = cls;
  Object.assign(e, rest);
  for (const c of children) e.append(c);
  return e;
}

export function button(label: string, onClick: () => void, opts: { cls?: string; disabled?: boolean; note?: string } = {}): HTMLButtonElement {
  const b = h('button', { cls: `btn ${opts.cls ?? ''}`, disabled: !!opts.disabled });
  b.append(label);
  if (opts.note) b.append(h('small', {}, opts.note));
  b.onclick = () => {
    audio.play('ui');
    onClick();
  };
  return b;
}

/** Title word drawn with our own stroke glyphs. */
export function titleCanvas(word = 'Alphabullet', size = 64): HTMLCanvasElement {
  const glyphs = [...word].map((ch) => {
    const L = LETTERS[ch.toUpperCase()];
    const form = ch === ch.toUpperCase() ? L.upper : L.lower;
    let minx = Infinity, maxx = -Infinity;
    for (const s of form.strokes) for (const p of s.pts) (minx = Math.min(minx, p.x)), (maxx = Math.max(maxx, p.x));
    return { form, minx, maxx };
  });
  const gap = 0.16;
  const width = glyphs.reduce((w, g) => w + (g.maxx - g.minx + gap) * size, 0) + size * 0.3;
  const c = h('canvas', { cls: 'title-canvas' });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.ceil(width * dpr);
  c.height = Math.ceil(size * 1.5 * dpr);
  c.style.width = `${width}px`;
  c.style.height = `${size * 1.5}px`;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  let x = size * 0.15;
  glyphs.forEach((g, i) => {
    x += -g.minx * size;
    const bob = Math.sin(i * 1.7) * size * 0.04;
    strokeGlyph(ctx, g.form.strokes, x, size * 0.75 + bob, size, INK, 0.12);
    x += (g.maxx + gap) * size;
  });
  return c;
}

let current: HTMLElement | null = null;

export function closeScreen(): void {
  current?.remove();
  current = null;
}

export function isScreenOpen(): boolean {
  return current !== null;
}

function show(el: HTMLElement): HTMLElement {
  closeScreen();
  current = el;
  ui().appendChild(el);
  el.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
  return el;
}

export interface MenuActions {
  onPlay: () => void;
  onHost: () => void;
  onJoin: () => void;
  online: boolean;
}

export function showMenu(a: MenuActions): void {
  const how = h(
    'div',
    { cls: 'panel how' },
    h('h3', {}, 'How to play'),
    h('p', {}, 'You ', h('b', {}, 'are'), ' a letter. It fires on its own from the free ends of its strokes, in the direction each stroke points. You never turn, so you aim by moving.'),
    h(
      'ul',
      {},
      h('li', {}, h('kbd', {}, 'Arrows'), ' move'),
      h('li', {}, h('kbd', {}, 'A-Z'), ' switch to a letter you own'),
      h('li', {}, h('kbd', {}, 'Shift'), ' CAPITAL power (once the letter is upgraded)'),
      h('li', {}, h('kbd', {}, 'Tab'), ' minimap  ', h('kbd', {}, 'Esc'), ' pause / settings'),
    ),
    h('p', {}, 'Walk over glowing letters to collect them. Damage and kills level up the letter you are using; when it upgrades, Shift turns it into its CAPITAL form for 20 s. O, D, B, C and Q carry shields on their curves. The fog closes in over time. Last letter standing wins.'),
  );
  show(
    h(
      'div',
      { cls: 'screen menu' },
      titleCanvas(),
      h('p', { cls: 'tagline' }, 'the glyph is the gun'),
      h(
        'div',
        { cls: 'menu-buttons' },
        button('Play vs bots', a.onPlay, { cls: 'primary' }),
        button('Host', a.onHost, { disabled: !a.online, note: a.online ? '' : 'coming soon' }),
        button('Join', a.onJoin, { disabled: !a.online, note: a.online ? '' : 'coming soon' }),
        button('Settings', () => showSettings(() => showMenu(a))),
      ),
      how,
    ),
  );
}

export function settingsPanel(): HTMLElement {
  const s = audio.settings;
  const slider = (label: string, value: number, on: (v: number) => void) => {
    const input = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(value * 100)) });
    input.oninput = () => on(Number(input.value) / 100);
    return h('label', { cls: 'setting' }, h('span', {}, label), input);
  };
  const mute = h('input', { type: 'checkbox', checked: s.muted });
  mute.onchange = () => audio.setSettings({ muted: mute.checked });
  return h(
    'div',
    { cls: 'panel settings' },
    h('h3', {}, 'Settings'),
    slider('Music', s.music, (v) => audio.setSettings({ music: v })),
    slider('Sound effects', s.sfx, (v) => {
      audio.setSettings({ sfx: v });
      audio.play('pickup');
    }),
    h('label', { cls: 'setting' }, h('span', {}, 'Mute all'), mute),
  );
}

export function showSettings(onBack: () => void): void {
  show(h('div', { cls: 'screen' }, settingsPanel(), button('Back', onBack)));
}

export function showPause(opts: { solo: boolean; onResume: () => void; onQuit: () => void }): void {
  show(
    h(
      'div',
      { cls: 'screen overlay' },
      h('h2', {}, opts.solo ? 'Paused' : 'Menu'),
      opts.solo ? '' : h('p', { cls: 'warn' }, 'Online match: the game keeps running!'),
      settingsPanel(),
      h('div', { cls: 'menu-buttons row' }, button('Resume (Esc)', opts.onResume, { cls: 'primary' }), button('Quit to menu', opts.onQuit)),
    ),
  );
}

export function showEnd(w: World, localId: number, opts: { onAgain: (() => void) | null; onMenu: () => void; message?: string }): void {
  const me = w.players[localId];
  const winner = w.winner !== null ? w.players[w.winner] : null;
  const won = winner?.id === localId;
  const survived = me.deathTime ?? w.time;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const stat = (k: string, v: string | number) => h('div', { cls: 'stat' }, h('span', {}, k), h('b', {}, String(v)));
  show(
    h(
      'div',
      { cls: 'screen overlay end' },
      opts.message ? h('p', { cls: 'warn' }, opts.message) : '',
      h('h2', {}, won ? 'You are the last letter standing!' : winner ? `${winner.name} wins` : 'Match over'),
      h(
        'div',
        { cls: 'panel stats' },
        stat('Your placement', me.placement ? `#${me.placement} of ${w.players.length}` : '-'),
        stat('Players erased', me.kills),
        stat('Symbols erased', me.mobKills),
        stat('Letters collected', me.lettersCollected),
        stat('Time survived', fmt(survived)),
      ),
      h('div', { cls: 'menu-buttons row' }, opts.onAgain ? button('Play again', opts.onAgain, { cls: 'primary' }) : '', button('Back to menu', opts.onMenu)),
    ),
  );
}

/** Simple notice with one button (errors, disconnects). */
export function showNotice(title: string, text: string, onOk: () => void): void {
  show(h('div', { cls: 'screen overlay' }, h('h2', {}, title), h('p', {}, text), button('OK', onOk, { cls: 'primary' })));
}

export function currentScreen(): HTMLElement | null {
  return current;
}
