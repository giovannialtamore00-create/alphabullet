/** Host and client sessions on top of a Conn. The host runs the authoritative sim. */
import { MAX_PLAYERS } from '../sim/config';
import type { PlayerInput, SimEvent, World } from '../sim/types';
import { moveStep, type PlayerSetup } from '../sim/world';
import { encodeSnapshot, NET_VERSION, type ClientMsg, type ClientView, type HostMsg, type Snapshot } from './protocol';
import type { Conn } from './transport';

/** Human player cap online (bots always fill to 8). See DECISIONS.md. */
export const MAX_HUMANS = 6;

interface RemoteClient {
  conn: Conn;
  name: string;
  view: ClientView;
  mx: number;
  my: number;
  switchTo: string | null;
  capital: boolean;
  left: boolean;
}

export class HostSession {
  private clients: RemoteClient[] = [];
  private started = false;
  private pendingEvents: SimEvent[] = [];
  onLobbyChange: (names: string[]) => void = () => {};
  onClientLeft: (playerId: number) => void = () => {};

  constructor(private hostName: string) {}

  get names(): string[] {
    return [this.hostName, ...this.clients.filter((c) => !c.left).map((c) => c.name)];
  }

  addConn(conn: Conn): void {
    let client: RemoteClient | null = null;
    conn.onMessage((m: ClientMsg) => {
      if (m.t === 'hello') {
        if (m.v !== NET_VERSION) return this.reject(conn, 'Version mismatch: refresh the page.');
        if (this.started) return this.reject(conn, 'That match has already started.');
        if (this.names.length >= MAX_HUMANS) return this.reject(conn, 'The room is full.');
        const name = String(m.name || 'Player').slice(0, 14);
        client = { conn, name, view: { playerId: -1, viewId: -1, sentBullets: new Set(), ack: 0 }, mx: 0, my: 0, switchTo: null, capital: false, left: false };
        this.clients.push(client);
        this.broadcastLobby();
      } else if (m.t === 'i' && client) {
        client.mx = Math.sign(m.mx) || 0;
        client.my = Math.sign(m.my) || 0;
        if (m.s) client.switchTo = m.s;
        if (m.c) client.capital = true;
        client.view.ack = Math.max(client.view.ack, m.q);
        if (typeof m.v === 'number') client.view.viewId = m.v;
      }
    });
    conn.onClose(() => {
      if (!client || client.left) return;
      client.left = true;
      if (this.started) this.onClientLeft(client.view.playerId);
      else {
        this.clients = this.clients.filter((c) => c !== client);
        this.broadcastLobby();
      }
    });
  }

  private reject(conn: Conn, reason: string): void {
    conn.send({ t: 'bye', reason } satisfies HostMsg);
    setTimeout(() => conn.close(), 200);
  }

  private broadcastLobby(): void {
    const names = this.names;
    this.clients.filter((c) => !c.left).forEach((c, i) => c.conn.send({ t: 'lobby', names, you: i + 1, max: MAX_HUMANS } satisfies HostMsg));
    this.onLobbyChange(names);
  }

  /** Lock the lobby and tell everyone to start. Humans first (host = 0), bots fill to 8. */
  start(seed: number, botNames: string[]): PlayerSetup[] {
    this.started = true;
    const humans = this.clients.filter((c) => !c.left);
    const players: PlayerSetup[] = [{ name: this.hostName, isBot: false }, ...humans.map((c) => ({ name: c.name, isBot: false }))];
    for (const n of botNames) if (players.length < MAX_PLAYERS) players.push({ name: n, isBot: true });
    humans.forEach((c, i) => {
      c.view.playerId = c.view.viewId = i + 1;
      c.conn.send({ t: 'start', seed, players, you: i + 1 } satisfies HostMsg);
    });
    return players;
  }

  /** Remote inputs for this tick; one-shot actions are consumed. */
  inputs(): Record<number, PlayerInput> {
    const out: Record<number, PlayerInput> = {};
    for (const c of this.clients) {
      if (c.left || c.view.playerId < 0) continue;
      out[c.view.playerId] = { mx: c.mx, my: c.my, switchTo: c.switchTo, capital: c.capital };
      c.switchTo = null;
      c.capital = false;
    }
    return out;
  }

  /** Call after every sim step; sends snapshots at 20 Hz (2 of every 3 ticks at 30 Hz). */
  afterTick(w: World): void {
    this.pendingEvents.push(...w.events);
    if (w.tick % 3 === 0 && !w.over) return;
    for (const c of this.clients) {
      if (c.left || c.view.playerId < 0) continue;
      c.conn.send({ t: 's', snap: encodeSnapshot(w, c.view, this.pendingEvents) } satisfies HostMsg);
    }
    this.pendingEvents = [];
  }

  close(): void {
    for (const c of this.clients) if (!c.left) c.conn.send({ t: 'bye', reason: 'The host closed the match.' } satisfies HostMsg);
    for (const c of this.clients) c.conn.close();
    this.clients = [];
  }
}

export class ClientSession {
  onLobby: (names: string[], you: number, max: number) => void = () => {};
  onStart: (seed: number, players: PlayerSetup[], you: number) => void = () => {};
  onSnapshot: (s: Snapshot) => void = () => {};
  onBye: (reason: string) => void = () => {};
  private seq = 0;
  private pending: { q: number; mx: number; my: number }[] = [];
  private server = { x: 0, y: 0 };
  private hasServer = false;

  constructor(readonly conn: Conn, private name: string) {
    conn.onMessage((m: HostMsg) => {
      if (m.t === 'lobby') this.onLobby(m.names, m.you, m.max);
      else if (m.t === 'start') this.onStart(m.seed, m.players, m.you);
      else if (m.t === 's') this.onSnapshot(m.snap);
      else if (m.t === 'bye') this.onBye(m.reason);
    });
  }

  /** Say hello to the host (call after setting the callbacks). */
  join(): void {
    this.conn.send({ t: 'hello', name: this.name, v: NET_VERSION } satisfies ClientMsg);
  }

  sendInput(inp: PlayerInput, viewId: number): void {
    const q = ++this.seq;
    this.pending.push({ q, mx: inp.mx, my: inp.my });
    if (this.pending.length > 90) this.pending.shift();
    this.conn.send({ t: 'i', q, mx: inp.mx, my: inp.my, s: inp.switchTo, c: inp.capital ? 1 : 0, v: viewId } satisfies ClientMsg);
  }

  /** Record the authoritative position of our player and drop acknowledged inputs. */
  reconcile(s: Snapshot, localId: number): void {
    const a = s.p[localId];
    if (!a) return;
    this.server = { x: a[0], y: a[1] };
    this.hasServer = true;
    this.pending = this.pending.filter((p) => p.q > s.ack);
  }

  /** Predicted position: server position plus inputs the host has not applied yet. */
  predicted(): { x: number; y: number } | null {
    if (!this.hasServer) return null;
    let pos = { ...this.server };
    for (const p of this.pending) pos = moveStep(pos.x, pos.y, p.mx, p.my);
    return pos;
  }

  close(): void {
    this.conn.close();
  }
}
