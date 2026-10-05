/** In-game HUD as a DOM overlay (black ink on paper). */
import { CAPITAL_COOLDOWN, CAPITAL_DURATION, FOG_STAGES, XP } from '../sim/config';
import { activeCopy } from '../sim/combat';
import { getForm } from '../sim/glyphDerive';
import type { World } from '../sim/types';
import { INK, strokeGlyph } from '../render/glyphCanvas';

const fmt = (s: number) => {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
}

interface Slot {
  box: HTMLDivElement;
  canvas: HTMLCanvasElement;
  xp: HTMLDivElement;
  key: string;
}

export class Hud {
  readonly root: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpText: HTMLSpanElement;
  private timer: HTMLDivElement;
  private alive: HTMLDivElement;
  private fogInfo: HTMLDivElement;
  private waveInfo: HTMLDivElement;
  private row: HTMLDivElement;
  private xpFill: HTMLDivElement;
  private xpText: HTMLSpanElement;
  private capInfo: HTMLDivElement;
  private fogWarn: HTMLDivElement;
  private spectate: HTMLDivElement;
  private toasts: HTMLDivElement;
  private slots: Slot[] = [];
  private textT = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    const tl = el('div', 'hud-hp', this.root);
    el('span', 'hud-label', tl).textContent = 'INK';
    const bar = el('div', 'bar', tl);
    this.hpFill = el('div', 'bar-fill', bar);
    this.hpText = el('span', 'hud-num', tl);
    const top = el('div', 'hud-top', this.root);
    this.timer = el('div', 'hud-timer', top);
    this.alive = el('div', 'hud-small', top);
    this.fogInfo = el('div', 'hud-small', top);
    this.waveInfo = el('div', 'hud-small', top);
    const bottom = el('div', 'hud-bottom', this.root);
    this.capInfo = el('div', 'hud-cap', bottom);
    const xpWrap = el('div', 'hud-xp', bottom);
    const xpBar = el('div', 'bar thin', xpWrap);
    this.xpFill = el('div', 'bar-fill', xpBar);
    this.xpText = el('span', 'hud-small', xpWrap);
    this.row = el('div', 'hud-row', bottom);
    this.fogWarn = el('div', 'hud-fogwarn', this.root);
    this.fogWarn.textContent = 'IN THE FOG - get back to the clear paper!';
    this.spectate = el('div', 'hud-spectate', this.root);
    this.toasts = el('div', 'hud-toasts', this.root);
  }

  toast(text: string, strong = false): void {
    const t = el('div', strong ? 'toast strong' : 'toast', this.toasts);
    t.textContent = text;
    setTimeout(() => t.classList.add('fade'), 1800);
    setTimeout(() => t.remove(), 2600);
    while (this.toasts.children.length > 4) this.toasts.firstChild!.remove();
  }

  update(w: World, localId: number, viewId: number, dt: number): void {
    const me = w.players[localId];
    const view = w.players[viewId] ?? me;
    const shown = me.alive ? me : view;
    this.hpFill.style.width = `${Math.max(0, shown.hp)}%`;
    this.fogWarn.style.display = me.alive && me.inFog ? 'block' : 'none';
    this.textT -= dt;
    if (this.textT > 0) return;
    this.textT = 0.1;
    this.hpText.textContent = String(Math.max(0, Math.ceil(shown.hp)));
    this.timer.textContent = fmt(w.time);
    this.alive.textContent = `${w.players.filter((p) => p.alive).length} / ${w.players.length} letters standing`;
    const f = w.fog;
    if (f.phase === 'wait') this.fogInfo.textContent = `Fog closes in ${fmt(f.timer)} (stage ${f.stage + 1}/${FOG_STAGES.length})`;
    else if (f.phase === 'shrink') this.fogInfo.textContent = `Fog closing... ${fmt(f.timer)}`;
    else this.fogInfo.textContent = 'Fog fully closed';
    this.waveInfo.textContent = w.wave.timer !== null ? `New letters in ${fmt(w.wave.timer)}` : '';
    if (me.alive) this.spectate.style.display = 'none';
    else {
      this.spectate.style.display = 'block';
      this.spectate.textContent = view.alive && view !== me
        ? `You placed #${me.placement}. Spectating ${view.name} (left/right to switch, Esc for menu)`
        : `You placed #${me.placement}.`;
    }
    this.updateLetters(w, shown.id);
  }

  private updateLetters(w: World, id: number): void {
    const p = w.players[id];
    const copies = p.letters.map((cid) => w.copies[cid]);
    while (this.slots.length < copies.length) {
      const box = el('div', 'slot', this.row);
      const canvas = el('canvas', 'slot-glyph', box);
      canvas.width = canvas.height = 64;
      const xp = el('div', 'slot-xp', box);
      this.slots.push({ box, canvas, xp, key: '' });
    }
    this.slots.forEach((s, i) => {
      const c = copies[i];
      s.box.style.display = c ? 'flex' : 'none';
      if (!c) return;
      const cap = c.capitalTimer > 0;
      const active = c.id === p.active;
      const key = `${c.letter}${cap}${active}${c.upgraded}`;
      if (key !== s.key) {
        s.key = key;
        const ctx = s.canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 64, 64);
        const f = getForm(c.letter, cap || c.upgraded);
        strokeGlyph(ctx, f.glyph.strokes, 32, 30, cap || c.upgraded ? 40 : 38, active ? '#f3eee2' : INK, 0.12);
        s.box.dataset.key = c.letter;
        s.box.classList.toggle('active', active);
        s.box.classList.toggle('upgraded', c.upgraded);
      }
      s.xp.style.width = `${c.upgraded ? 100 : Math.min(100, (c.xp / XP.threshold) * 100)}%`;
    });
    const c = activeCopy(w, p);
    if (!c) {
      this.capInfo.textContent = '';
      this.xpText.textContent = '';
      this.xpFill.style.width = '0%';
      return;
    }
    this.xpFill.style.width = `${c.upgraded ? 100 : Math.min(100, (c.xp / XP.threshold) * 100)}%`;
    this.xpText.textContent = c.upgraded ? `${c.letter} upgraded` : `${c.letter.toLowerCase()} XP ${Math.floor(c.xp)} / ${XP.threshold}`;
    if (!c.upgraded) this.capInfo.textContent = 'CAPITAL locked - earn XP with this letter';
    else if (c.capitalTimer > 0) this.capInfo.textContent = `CAPITAL ${c.letter}! ${Math.ceil(c.capitalTimer)}s`;
    else if (c.capitalCd > 0) this.capInfo.textContent = `CAPITAL recharging ${Math.ceil(c.capitalCd)}s`;
    else this.capInfo.textContent = 'SHIFT: CAPITAL ready!';
    this.capInfo.classList.toggle('ready', c.upgraded && c.capitalTimer <= 0 && c.capitalCd <= 0);
    this.capInfo.style.setProperty('--cap', c.capitalTimer > 0 ? `${(c.capitalTimer / CAPITAL_DURATION) * 100}%` : c.capitalCd > 0 ? `${100 - (c.capitalCd / CAPITAL_COOLDOWN) * 100}%` : '100%');
  }

  destroy(): void {
    this.root.remove();
  }
}
