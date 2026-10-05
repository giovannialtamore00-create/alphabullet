/** Runs a match: fixed 30 Hz sim steps, bots, local keyboard, renderer and HUD. */
import { botInputs, type BotBrain } from '../sim/bots';
import { DT } from '../sim/config';
import { createWorld, step, type PlayerSetup } from '../sim/world';
import type { PlayerInput, SimEvent, World } from '../sim/types';
import { Keyboard } from '../input/keyboard';
import { GameRenderer } from '../render/renderer';
import { Hud } from '../ui/hud';

export interface MatchSetup {
  seed: number;
  players: PlayerSetup[];
  localId: number;
  /** Solo vs bots: Esc truly pauses. */
  solo: boolean;
}

export interface GameCallbacks {
  onEnd: (w: World) => void;
  onEscape: () => void;
}

export type EventListener = (events: SimEvent[], w: World) => void;

export class Game {
  world: World;
  readonly renderer = new GameRenderer();
  hud!: Hud;
  keyboard: Keyboard;
  brains = new Map<number, BotBrain>();
  paused = false;
  minimap = true;
  viewId: number;
  debug = { hitboxes: false };
  /** Extra inputs/hooks (debug panel, network). */
  inputOverride: ((w: World) => Record<number, PlayerInput>) | null = null;
  private listeners: EventListener[] = [];
  private acc = 0;
  private last = 0;
  private raf = 0;
  private endTimer = -1;
  private lastSpecMx = 0;
  fps = 0;

  constructor(
    private parent: HTMLElement,
    readonly setup: MatchSetup,
    private cb: GameCallbacks,
  ) {
    this.world = createWorld(setup.seed, setup.players);
    this.viewId = setup.localId;
    this.keyboard = new Keyboard({
      onMinimap: () => (this.minimap = !this.minimap),
      onEscape: () => this.cb.onEscape(),
    });
  }

  get localId(): number {
    return this.setup.localId;
  }

  onEvents(fn: EventListener): void {
    this.listeners.push(fn);
  }

  async start(): Promise<void> {
    await this.renderer.init(this.parent);
    this.hud = new Hud(this.parent);
    this.onEvents((ev) => this.coreEvents(ev));
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;
    if (!this.paused) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= DT && steps < 4) {
        this.acc -= DT;
        steps++;
        this.tick();
      }
      if (steps === 4) this.acc = 0; // fell behind: drop time rather than spiral
    }
    this.renderer.render(this.world, this.paused ? 1 : this.acc / DT, dt, {
      localId: this.localId,
      viewId: this.viewId,
      minimap: this.minimap,
      debug: this.debug,
    });
    this.hud.update(this.world, this.localId, this.viewId, dt);
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.cb.onEnd(this.world);
    }
  };

  /** One fixed sim step with all inputs. */
  tick(): void {
    const w = this.world;
    this.renderer.snapshotPrev(w);
    const local = this.keyboard.poll();
    const inputs: Record<number, PlayerInput> = { ...botInputs(w, this.brains), [this.localId]: local };
    if (this.inputOverride) Object.assign(inputs, this.inputOverride(w));
    this.spectateControls(local);
    step(w, inputs);
    if (w.events.length) for (const l of this.listeners) l(w.events, w);
  }

  private spectateControls(inp: PlayerInput): void {
    const me = this.world.players[this.localId];
    const alive = this.world.players.filter((p) => p.alive);
    if (me.alive || !alive.length) {
      if (me.alive) this.viewId = this.localId;
      return;
    }
    const cur = this.world.players[this.viewId];
    if (!cur?.alive) this.viewId = alive[0].id;
    if (inp.mx !== 0 && this.lastSpecMx === 0) {
      const i = alive.findIndex((p) => p.id === this.viewId);
      this.viewId = alive[(i + inp.mx + alive.length) % alive.length].id;
    }
    this.lastSpecMx = inp.mx;
  }

  private coreEvents(events: SimEvent[]): void {
    const w = this.world;
    const me = this.localId;
    for (const e of events) {
      switch (e.t) {
        case 'hit':
          if (e.target === 'mob') this.renderer.flashMob(e.id);
          else {
            this.renderer.flashPlayer(e.id);
            if (e.id === this.viewId && e.dmg >= 6) this.renderer.shake(e.dmg * 0.6);
          }
          break;
        case 'pickup':
          if (e.id === me) this.hud.toast(`Picked up ${e.letter}`);
          break;
        case 'upgrade':
          if (e.id === me) this.hud.toast(`${e.letter} upgraded! Press SHIFT for CAPITAL ${e.letter}`, true);
          break;
        case 'playerDeath': {
          const victim = w.players[e.id];
          const killer = e.by !== null ? w.players[e.by] : null;
          this.hud.toast(killer ? `${killer.name} erased ${victim.name}` : `${victim.name} faded in the fog`);
          if (e.id === this.viewId) this.renderer.shake(10);
          break;
        }
        case 'letterWave':
          this.hud.toast('New letters appeared on the map');
          break;
        case 'fogStage':
          this.hud.toast('The fog has closed in');
          break;
        case 'matchOver':
          this.endTimer = 2.5;
          break;
      }
    }
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.keyboard.dispose();
    this.hud?.destroy();
    this.renderer.destroy();
  }
}
