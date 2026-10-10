/** Host and client sessions on top of a Conn. The host runs the authoritative sim. */
import { MAX_PLAYERS } from '../sim/config';
import type { PlayerInput, SimEvent, World } from '../sim/types';
import { moveStep, type PlayerSetup } from '../sim/world';
import { encodeSnapshot, NET_VERSION, newClientView, type ClientMsg, type ClientView, type HostMsg, type Snapshot } from './protocol';
import type { Conn } from './transport';

/** Human player cap online (bots always fill to 8). See DECISIONS.md. */
export const MAX_HUMANS = 6;

interface RemoteClient {
  conn: Conn;
  name: string;
  view: ClientView;
  mx: number;
  my: number;
  lastQ: number; // newest input seq seen (older movement arriving late is ignored)
  switchTo: string | null;
  capital: boolean;
  word: string | null;
  wordBack: string | null;
  left: boolean;
  token: string; // secret the guest shows to take this slot back
  away: ReturnType<typeof setTimeout> | null; // grace timer while disconnected
}

const newToken = () => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2)).join('');

export class HostSession {
  private clients: RemoteClient[] = [];
  private started = false;
  private pendingEvents: SimEvent[] = [];
  onLobbyChange: (names: string[]) => void = () => {};
  onClientLeft: (playerId: number) => void = () => {};
  /** A guest dropped (true) or came back (false); they keep their slot for `graceMs`. */
  onClientAway: (playerId: number, away: boolean) => void = () => {};
  graceMs = 30000;
  private seed = 0;
  private setup: PlayerSetup[] = [];

  constructor(private hostName: string) {}

  get names(): string[] {
    return [this.hostName, ...this.clients.filter((c) => !c.left).map((c) => c.name)];
  }

  addConn(conn: Conn): void {
    let client: RemoteClient | null = null;
    conn.onMessage((m: ClientMsg) => {
      if (m.t === 'hello') {
        if (m.v !== NET_VERSION) return this.reject(conn, 'Version mismatch: refresh the page.');
        const back = this.started && m.tok ? this.clients.find((c) => c.token === m.tok && !c.left && c.view.playerId >= 0) : undefined;
        if (back) {
          // Rejoin: take the old slot back on the new connection.
          if (back.away) clearTimeout(back.away);
          const old = back.conn;
          back.conn = conn;
          back.away = null;
          back.view = newClientView(back.view.playerId);
          back.lastQ = 0;
          client = back;
          old.close();
          this.onClientAway(back.view.playerId, false);
          conn.send({ t: 'start', seed: this.seed, players: this.setup, you: back.view.playerId, tok: back.token } satisfies HostMsg);
          return;
        }
        if (this.started) return this.reject(conn, 'That match has already started.');
        if (this.names.length >= MAX_HUMANS) return this.reject(conn, 'The room is full.');
        const name = String(m.name || 'Player').slice(0, 14);
        client = { conn, name, view: newClientView(), mx: 0, my: 0, lastQ: 0, switchTo: null, capital: false, word: null, wordBack: null, left: false, token: newToken(), away: null };
        this.clients.push(client);
        this.broadcastLobby();
      } else if (m.t === 'i' && client) {
        if (m.q > client.lastQ) {
          client.lastQ = m.q;
          client.mx = Math.sign(m.mx) || 0;
          client.my = Math.sign(m.my) || 0;
        }
        if (m.s) client.switchTo = m.s;
        if (m.c) client.capital = true;
        if (m.w) {
          client.word = m.w;
          client.wordBack = m.b ?? null;
        }
        client.view.ack = Math.max(client.view.ack, m.q);
        if (typeof m.v === 'number') client.view.viewId = m.v;
      }
    });
    conn.onClose(() => {
      if (!client || client.left || client.conn !== conn) return; // conn.left or replaced by a rejoin
      if (this.started) {
        const c = client;
        c.mx = c.my = 0;
        c.away = setTimeout(() => {
          c.left = true;
          this.onClientLeft(c.view.playerId);
        }, this.graceMs);
        this.onClientAway(c.view.playerId, true);
      } else {
        client.left = true;
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
    this.seed = seed;
    const humans = this.clients.filter((c) => !c.left);
    const players: PlayerSetup[] = [{ name: this.hostName, isBot: false }, ...humans.map((c) => ({ name: c.name, isBot: false }))];
    for (const n of botNames) if (players.length < MAX_PLAYERS) players.push({ name: n, isBot: true });
    this.setup = players;
    humans.forEach((c, i) => {
      c.view.playerId = c.view.viewId = i + 1;
      c.conn.send({ t: 'start', seed, players, you: i + 1, tok: c.token } satisfies HostMsg);
    });
    return players;
  }

  /** Remote inputs for this tick; one-shot actions are consumed. */
  inputs(): Record<number, PlayerInput> {
    const out: Record<number, PlayerInput> = {};
    for (const c of this.clients) {
      if (c.left || c.view.playerId < 0 || c.away) continue;
      out[c.view.playerId] = { mx: c.mx, my: c.my, switchTo: c.switchTo, capital: c.capital, word: c.word, wordBack: c.wordBack };
      c.word = null;
      c.wordBack = null;
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
      if (c.left || c.view.playerId < 0 || c.away) continue;
      const msg = { t: 's', snap: encodeSnapshot(w, c.view, this.pendingEvents) } satisfies HostMsg;
      if (c.conn.sendFast) c.conn.sendFast(msg);
      else c.conn.send(msg);
    }
    this.pendingEvents = [];
  }

  close(): void {
    for (const c of this.clients) if (c.away) clearTimeout(c.away);
    for (const c of this.clients) if (!c.left) c.conn.send({ t: 'bye', reason: 'The host closed the match.' } satisfies HostMsg);
    for (const c of this.clients) c.conn.close();
    this.clients = [];
  }
}

export class ClientSession {
  onLobby: (names: string[], you: number, max: number) => void = () => {};
  onStart: (seed: number, players: PlayerSetup[], you: number, tok: string) => void = () => {};
  onSnapshot: (s: Snapshot) => void = () => {};
  onBye: (reason: string) => void = () => {};
  private seq = 0;
  private pending: { q: number; mx: number; my: number }[] = [];
  private server = { x: 0, y: 0 };
  private hasServer = false;
  private lastMul = 1;
  /** Visual correction that fades to 0: hides small jumps when the host disagrees with our prediction. */
  private off = { x: 0, y: 0 };

  constructor(readonly conn: Conn, private name: string, private rejoinToken?: string) {
    conn.onMessage((m: HostMsg) => {
      if (m.t === 'lobby') this.onLobby(m.names, m.you, m.max);
      else if (m.t === 'start') this.onStart(m.seed, m.players, m.you, m.tok ?? '');
      else if (m.t === 's') this.onSnapshot(m.snap);
      else if (m.t === 'bye') this.onBye(m.reason);
    });
  }

  /** Say hello to the host (call after setting the callbacks). */
  join(): void {
    this.conn.send({ t: 'hello', name: this.name, v: NET_VERSION, tok: this.rejoinToken } satisfies ClientMsg);
  }

  sendInput(inp: PlayerInput, viewId: number): void {
    const q = ++this.seq;
    this.pending.push({ q, mx: inp.mx, my: inp.my });
    if (this.pending.length > 90) this.pending.shift();
    const msg = { t: 'i', q, mx: inp.mx, my: inp.my, s: inp.switchTo, c: inp.capital ? 1 : 0, v: viewId, w: inp.word ?? null, b: inp.wordBack ?? null } satisfies ClientMsg;
    // Plain movement may be lost (the next tick's input replaces it); presses must arrive.
    if (inp.switchTo || inp.capital || inp.word || !this.conn.sendFast) this.conn.send(msg);
    else this.conn.sendFast(msg);
  }

  /** Record the authoritative position of our player and drop acknowledged inputs. */
  reconcile(s: Snapshot, localId: number): void {
    const a = s.p[localId];
    if (!a) return;
    const before = this.raw(this.lastMul);
    this.server = { x: a[0], y: a[1] };
    this.hasServer = true;
    this.pending = this.pending.filter((p) => p.q > s.ack);
    const after = this.raw(this.lastMul)!;
    if (before) {
      const dx = before.x - after.x;
      const dy = before.y - after.y;
      // Big jumps (DASH, respawn, push) snap; small disagreements fade out.
      this.off = Math.hypot(dx, dy) > 100 ? { x: 0, y: 0 } : { x: this.off.x + dx, y: this.off.y + dy };
    }
  }

  /** Fade the visual correction; call once per client tick. */
  tickSmoothing(): void {
    this.off = { x: this.off.x * 0.85, y: this.off.y * 0.85 };
  }

  /** Predicted position: server position plus inputs the host has not applied yet, plus the fading correction. */
  predicted(mul = 1): { x: number; y: number } | null {
    this.lastMul = mul;
    const pos = this.raw(mul);
    return pos && { x: pos.x + this.off.x, y: pos.y + this.off.y };
  }

  private raw(mul: number): { x: number; y: number } | null {
    if (!this.hasServer) return null;
    let pos = { ...this.server };
    for (const p of this.pending) pos = moveStep(pos.x, pos.y, p.mx, p.my, mul);
    return pos;
  }

  close(): void {
    this.conn.close();
  }
}
