/** In-game HUD as a DOM overlay (black ink on paper). */
import { CAPITAL_COOLDOWN, CAPITAL_DURATION, FOG_STAGES, SPLASH, XP } from '../sim/config';
import { activeCopy, copyMaxHp } from '../sim/combat';
import { getForm } from '../sim/glyphDerive';
import type { LetterCopy, TimedFx, World } from '../sim/types';
import { WORDS } from '../sim/words';

/** Progress (0..1) toward the copy's next level. */
const levelProgress = (c: LetterCopy) =>
  c.xp >= XP.rateThreshold
    ? 1
    : c.xp >= XP.damageThreshold
      ? (c.xp - XP.damageThreshold) / (XP.rateThreshold - XP.damageThreshold)
      : c.upgraded
        ? (c.xp - XP.capitalThreshold) / (XP.damageThreshold - XP.capitalThreshold)
        : c.bold
          ? Math.min(1, (c.xp - XP.threshold) / (XP.capitalThreshold - XP.threshold))
          : Math.min(1, c.xp / XP.threshold);
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
  hp: HTMLDivElement;
  key: string;
}

export class Hud {
  readonly root: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpText: HTMLSpanElement;
  private tempFill: HTMLDivElement;
  private timer: HTMLDivElement;
  private alive: HTMLDivElement;
  private fogInfo: HTMLDivElement;
  private waveInfo: HTMLDivElement;
  private row: HTMLDivElement;
  private xpFill: HTMLDivElement;
  private xpText: HTMLSpanElement;
  private capInfo: HTMLDivElement;
  private words: { row: HTMLDivElement; letters: HTMLSpanElement[]; info: HTMLSpanElement }[] = [];
  private fogWarn: HTMLDivElement;
  private ink: HTMLDivElement;
  private spectate: HTMLDivElement;
  private toasts: HTMLDivElement;
  private slots: Slot[] = [];
  private textT = 0;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud', parent);
    // SPLASH ink: blotches over the whole screen, fading out as the effect ends.
    this.ink = el('div', 'hud-ink', this.root);
    this.ink.style.cssText =
      'position:fixed;inset:0;pointer-events:none;opacity:0;z-index:5;background:' +
      'radial-gradient(circle at 20% 30%,#000 0 14%,transparent 15%),radial-gradient(circle at 75% 25%,#000 0 17%,transparent 18%),' +
      'radial-gradient(circle at 50% 60%,#000 0 20%,transparent 21%),radial-gradient(circle at 25% 80%,#000 0 15%,transparent 16%),' +
      'radial-gradient(circle at 85% 75%,#000 0 16%,transparent 17%),rgba(0,0,0,0.35)';
    const tl = el('div', 'hud-hp', this.root);
    el('span', 'hud-label', tl).textContent = 'INK';
    const bar = el('div', 'bar', tl);
    this.hpFill = el('div', 'bar-fill', bar);
    this.tempFill = el('div', 'bar-temp', bar);
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
    const wordList = el('div', 'hud-words', this.root);
    for (const d of WORDS) {
      const row = el('div', 'hud-word', wordList);
      const letters = [...d.word].map((ch) => {
        const s = el('span', 'wl', row);
        s.textContent = ch;
        return s;
      });
      this.words.push({ row, letters, info: el('span', 'hud-word-info', row) });
    }
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
    const hpPct = Math.max(0, (shown.hp / shown.maxHp) * 100);
    this.hpFill.style.width = `${hpPct}%`;
    // CAPITAL bonus HP: hatched stripe along the bottom of the bar.
    this.tempFill.style.width = `${Math.min(100, (shown.tempHp / shown.maxHp) * 100)}%`;
    this.fogWarn.style.display = me.alive && me.inFog ? 'block' : 'none';
    this.ink.style.opacity = String(me.alive ? SPLASH.cover * Math.min(1, me.splashT / SPLASH.duration) / 0.85 : 0);
    this.textT -= dt;
    if (this.textT > 0) return;
    this.textT = 0.1;
    this.hpText.textContent = `${Math.max(0, Math.ceil(shown.hp))}${shown.tempHp > 0 ? ` +${Math.ceil(shown.tempHp)}` : ""}  ${"\u2665".repeat(shown.lives)}`;
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
    this.updateWords(w, shown.id);
  }

  private updateLetters(w: World, id: number): void {
    const p = w.players[id];
    const copies = p.letters.map((cid) => w.copies[cid]);
    while (this.slots.length < copies.length) {
      const box = el('div', 'slot', this.row);
      const canvas = el('canvas', 'slot-glyph', box);
      canvas.width = canvas.height = 64;
      const hp = el('div', 'slot-hp', box);
      const xp = el('div', 'slot-xp', box);
      this.slots.push({ box, canvas, xp, hp, key: '' });
    }
    this.slots.forEach((s, i) => {
      const c = copies[i];
      s.box.style.display = c ? 'flex' : 'none';
      if (!c) return;
      const cap = c.capitalTimer > 0;
      const active = c.id === p.active;
      const key = `${c.letter}${cap}${active}${c.upgraded}${c.bold}`;
      if (key !== s.key) {
        s.key = key;
        const ctx = s.canvas.getContext('2d')!;
        ctx.clearRect(0, 0, 64, 64);
        const f = getForm(c.letter, cap || c.upgraded);
        strokeGlyph(ctx, f.glyph.strokes, 32, 30, cap || c.upgraded ? 40 : 38, active ? '#f3eee2' : INK, c.bold ? 0.2 : 0.12);
        s.box.dataset.key = c.letter;
        s.box.classList.toggle('active', active);
        s.box.classList.toggle('upgraded', c.upgraded);
      }
      s.xp.style.width = `${levelProgress(c) * 100}%`;
      // Each letter has its own HP (ink); the active one is live on the player.
      const hp = active ? p.hp / p.maxHp : c.hp / copyMaxHp(c);
      s.hp.style.width = `${Math.max(0, Math.min(1, hp)) * 100}%`;
    });
    const c = activeCopy(w, p);
    if (!c) {
      this.capInfo.textContent = '';
      this.xpText.textContent = '';
      this.xpFill.style.width = '0%';
      return;
    }
    this.xpFill.style.width = `${levelProgress(c) * 100}%`;
    this.xpText.textContent = c.xp >= XP.rateThreshold
      ? `Lv4 ${c.letter} - max level (+15% damage, +20% fire rate)`
      : c.xp >= XP.damageThreshold
        ? `Lv3 ${c.letter} +15% damage - XP ${Math.floor(c.xp)} / ${XP.rateThreshold} to +20% fire rate`
        : c.upgraded
          ? `Lv2 ${c.letter} CAPITAL - XP ${Math.floor(c.xp)} / ${XP.damageThreshold} to +15% damage`
          : c.bold
        ? `Lv1 ${c.letter} BOLD - XP ${Math.floor(c.xp)} / ${XP.capitalThreshold} to CAPITAL`
        : `Lv0 ${c.letter.toLowerCase()} - XP ${Math.floor(c.xp)} / ${XP.threshold} to BOLD`;
    if (!c.upgraded) this.capInfo.textContent = 'CAPITAL locked - earn XP with this letter';
    else if (c.capitalTimer > 0) this.capInfo.textContent = `CAPITAL ${c.letter}! ${Math.ceil(c.capitalTimer)}s`;
    else if (c.capitalCd > 0) this.capInfo.textContent = `CAPITAL recharging ${Math.ceil(c.capitalCd)}s`;
    else this.capInfo.textContent = 'SHIFT: CAPITAL ready!';
    this.capInfo.classList.toggle('ready', c.upgraded && c.capitalTimer <= 0 && c.capitalCd <= 0);
    this.capInfo.style.setProperty('--cap', c.capitalTimer > 0 ? `${(c.capitalTimer / CAPITAL_DURATION) * 100}%` : c.capitalCd > 0 ? `${100 - (c.capitalCd / CAPITAL_COOLDOWN) * 100}%` : '100%');
  }

  /** Side list of every word power: owned letters glow; a fully owned word shows its cooldown or "ready". */
  private updateWords(w: World, id: number): void {
    const p = w.players[id];
    const have = new Set(p.letters.map((c) => w.copies[c].letter));
    WORDS.forEach((d, i) => {
      const { row, letters, info } = this.words[i];
      letters.forEach((s, k) => s.classList.toggle('owned', have.has(d.word[k])));
      const all = [...d.word].every((ch) => have.has(ch));
      const cd = p.wordCd[d.word] ?? 0;
      row.classList.toggle('complete', all);
      row.classList.toggle('ready', all && cd <= 0 && !p.passives.includes(d.word));
      const active = d.effect in p.fx ? p.fx[d.effect as TimedFx] : 0;
      const slot = p.passives.indexOf(d.word);
      row.classList.toggle('passive', slot >= 0);
      if (slot >= 0) info.textContent = all ? 'ON' : 'off';
      else if (active > 0) info.textContent = `${Math.ceil(active)}s!`;
      else info.textContent = all && cd > 0 ? `${Math.ceil(cd)}s` : '';
    });
  }

  destroy(): void {
    this.root.remove();
  }
}
