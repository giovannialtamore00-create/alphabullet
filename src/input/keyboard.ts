/** Keyboard -> PlayerInput. Arrows move, A-Z switch letter, Shift = CAPITAL, Tab = minimap, Esc = menu. */
import { WORD_TYPE_WINDOW } from '../sim/config';
import type { PlayerInput } from '../sim/types';
import { matchWord } from '../sim/words';

export interface KeyboardHandlers {
  onMinimap?: () => void;
  onEscape?: () => void;
  onDebugKey?: (key: string) => void;
  /** Letter the local player currently holds, so a word can switch back to it. */
  activeLetter?: () => string | null;
}

export class Keyboard {
  private held = new Set<string>();
  private pendingLetter: string | null = null;
  private pendingCapital = false;
  private pendingWord: string | null = null;
  private pendingBack: string | null = null;
  private typed = ''; // recent letters, for word powers
  private heldBefore: (string | null)[] = []; // letter held just before each typed letter
  private lastType = 0;
  enabled = true;

  constructor(private handlers: KeyboardHandlers = {}) {
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', () => this.held.clear());
  }

  dispose(): void {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
  }

  private down = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!e.repeat) this.handlers.onMinimap?.();
      return;
    }
    if (e.key === 'Escape') {
      if (!e.repeat) this.handlers.onEscape?.();
      return;
    }
    if (!this.enabled) return;
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      this.held.add(e.key);
      return;
    }
    if (e.key === 'Shift') {
      if (!e.repeat) this.pendingCapital = true;
      return;
    }
    if (/^F\d$/.test(e.key) || e.key === '`') {
      this.handlers.onDebugKey?.(e.key);
      return;
    }
    // e.code keeps working while Shift is held and on non-QWERTY layouts.
    const m = /^Key([A-Z])$/.exec(e.code);
    if (m && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.pendingLetter = m[1];
      if (!e.repeat) this.typeLetter(m[1], e.timeStamp / 1000, this.handlers.activeLetter?.() ?? null);
    }
  };

  private up = (e: KeyboardEvent) => {
    this.held.delete(e.key);
  };

  /** Letters typed within WORD_TYPE_WINDOW of each other build up a word; a known word fires once. */
  typeLetter(letter: string, now: number, held: string | null = null): void {
    if (now - this.lastType > WORD_TYPE_WINDOW) {
      this.typed = '';
      this.heldBefore = [];
    }
    this.lastType = now;
    this.typed = (this.typed + letter).slice(-12);
    this.heldBefore = [...this.heldBefore, held].slice(-12);
    const word = matchWord(this.typed);
    if (word) {
      this.pendingWord = word;
      this.pendingBack = this.heldBefore[this.heldBefore.length - word.length] ?? null;
      this.typed = '';
      this.heldBefore = [];
    }
  }

  /** Input for this tick; one-shot actions are consumed. */
  poll(): PlayerInput {
    const mx = (this.held.has('ArrowRight') ? 1 : 0) - (this.held.has('ArrowLeft') ? 1 : 0);
    const my = (this.held.has('ArrowDown') ? 1 : 0) - (this.held.has('ArrowUp') ? 1 : 0);
    const inp: PlayerInput = { mx, my, switchTo: this.pendingLetter, capital: this.pendingCapital, word: this.pendingWord, wordBack: this.pendingBack };
    this.pendingWord = null;
    this.pendingBack = null;
    this.pendingLetter = null;
    this.pendingCapital = false;
    if (!this.enabled) return { mx: 0, my: 0, switchTo: null, capital: false };
    return inp;
  }
}
