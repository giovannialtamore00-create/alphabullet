/** Keyboard -> PlayerInput. Arrows move, A-Z switch letter, Shift = CAPITAL, Tab = minimap, Esc = menu. */
import type { PlayerInput } from '../sim/types';

export interface KeyboardHandlers {
  onMinimap?: () => void;
  onEscape?: () => void;
  onDebugKey?: (key: string) => void;
}

export class Keyboard {
  private held = new Set<string>();
  private pendingLetter: string | null = null;
  private pendingCapital = false;
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
    if (m && !e.ctrlKey && !e.metaKey && !e.altKey) this.pendingLetter = m[1];
  };

  private up = (e: KeyboardEvent) => {
    this.held.delete(e.key);
  };

  /** Input for this tick; one-shot actions are consumed. */
  poll(): PlayerInput {
    const mx = (this.held.has('ArrowRight') ? 1 : 0) - (this.held.has('ArrowLeft') ? 1 : 0);
    const my = (this.held.has('ArrowDown') ? 1 : 0) - (this.held.has('ArrowUp') ? 1 : 0);
    const inp: PlayerInput = { mx, my, switchTo: this.pendingLetter, capital: this.pendingCapital };
    this.pendingLetter = null;
    this.pendingCapital = false;
    if (!this.enabled) return { mx: 0, my: 0, switchTo: null, capital: false };
    return inp;
  }
}
