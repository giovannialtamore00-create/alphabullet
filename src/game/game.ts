/** Runs a match: fixed 30 Hz sim steps, bots, local keyboard, renderer and HUD. */
import { botInputs, type BotBrain } from '../sim/bots';
import { speedMul } from '../sim/combat';
import { DT } from '../sim/config';
import { createWorld, step, type PlayerSetup } from '../sim/world';
import type { PlayerInput, SimEvent, World } from '../sim/types';
import { Keyboard } from '../input/keyboard';
import { GameRenderer } from '../render/renderer';
import { Hud } from '../ui/hud';
import { advanceBullets, applySnapshot, type Snapshot } from '../net/protocol';
import type { ClientSession, HostSession } from '../net/session';
import { SnapshotBuffer } from '../net/interp';

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
  private frameHooks: ((dt: number, alpha: number) => void)[] = [];
  private acc = 0;
  private last = 0;
  private raf = 0;
  private endTimer = -1;
  private lastSpecMx = 0;
  fps = 0;
  /** Online roles: host runs the sim and sends snapshots; client only mirrors. */
  net: { host?: HostSession; client?: ClientSession } = {};
  private snapBuf = new SnapshotBuffer<Snapshot>();

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
      activeLetter: () => {
        const me = this.world.players[this.localId];
        return me.active === null ? null : this.world.copies[me.active].letter;
      },
    });
  }

  get localId(): number {
    return this.setup.localId;
  }

  onEvents(fn: EventListener): void {
    this.listeners.push(fn);
  }

  onFrame(fn: (dt: number, alpha: number) => void): void {
    this.frameHooks.push(fn);
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
    let alpha = this.paused ? 1 : this.acc / DT;
    this.renderer.localAlpha = alpha;
    if (this.net.client) {
      const due = this.snapBuf.update(now);
      for (const s of due.apply) this.applyNetSnapshot(s);
      alpha = due.alpha;
      advanceBullets(this.world, dt);
    }
    this.renderer.render(this.world, alpha, dt, {
      localId: this.localId,
      viewId: this.viewId,
      minimap: this.minimap,
      debug: this.debug,
    });
    this.hud.update(this.world, this.localId, this.viewId, dt);
    for (const h of this.frameHooks) h(this.paused ? 0 : dt, alpha);
    if (this.endTimer > 0) {
      this.endTimer -= dt;
      if (this.endTimer <= 0) this.cb.onEnd(this.world);
    }
  };

  /** One fixed sim step with all inputs. */
  tick(): void {
    if (this.net.client) return this.clientTick(this.net.client);
    const w = this.world;
    this.renderer.snapshotPrev(w);
    const local = this.keyboard.poll();
    const inputs: Record<number, PlayerInput> = { ...botInputs(w, this.brains), [this.localId]: local };
    if (this.inputOverride) Object.assign(inputs, this.inputOverride(w));
    this.spectateControls(local);
    step(w, inputs);
    this.net.host?.afterTick(w);
    if (w.events.length) for (const l of this.listeners) l(w.events, w);
  }

  /** Online client tick: send input, predict our own movement. The host owns everything else. */
  private clientTick(client: ClientSession): void {
    const local = this.keyboard.poll();
    this.spectateControls(local);
    const me = this.world.players[this.localId];
    client.sendInput(me.alive ? local : { mx: 0, my: 0, switchTo: null, capital: false }, this.viewId);
    this.renderer.localPrev.set(me.id, { x: me.x, y: me.y });
    this.applyPrediction(client);
  }

  private applyPrediction(client: ClientSession): void {
    const me = this.world.players[this.localId];
    const pred = client.predicted(speedMul(me));
    if (pred && me.alive) {
      me.x = pred.x;
      me.y = pred.y;
    }
  }

  /** Online client: apply an authoritative snapshot from the host. */
  applyNetSnapshot(snap: Snapshot): void {
    const client = this.net.client!;
    this.renderer.snapshotPrev(this.world);
    applySnapshot(this.world, snap, { keepLocal: this.localId });
    client.reconcile(snap, this.localId);
    this.applyPrediction(client);
    if (snap.e.length) for (const l of this.listeners) l(snap.e, this.world);
  }

  /** Client mode setup: render without lerp for our predicted player and local bullets. */
  enableClientMode(client: ClientSession): void {
    this.net.client = client;
    this.renderer.noLerpId = this.localId;
    this.renderer.bulletLerp = false;
    client.onSnapshot = (s) => this.snapBuf.push(s, performance.now());
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
        case 'bold':
          if (e.id === me) this.hud.toast(`${e.letter} is now BOLD! Bullets are 25% bigger`, true);
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
        case 'letterLost': {
          const victim = w.players[e.id];
          const now = victim.active !== null ? w.copies[victim.active].letter : '';
          if (e.id === me) {
            this.hud.toast(`Your ${e.letter} ran out of ink! Respawned as ${now} (${victim.lives} ${victim.lives === 1 ? 'life' : 'lives'} left)`, true);
            this.renderer.shake(8);
          } else if (e.by === me) this.hud.toast(`You broke ${victim.name}'s ${e.letter}`);
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
