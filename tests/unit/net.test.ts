import { describe, expect, it } from 'vitest';
import { advanceBullets, applySnapshot, type Snapshot } from '../../src/net/protocol';
import { ClientSession, HostSession, MAX_HUMANS } from '../../src/net/session';
import { memoryPair } from '../../src/net/transport';
import { botInputs } from '../../src/sim/bots';
import { createWorld, removePlayer, step } from '../../src/sim/world';
import type { PlayerSetup } from '../../src/sim/world';

function setup() {
  const host = new HostSession('Host');
  const [hc, cc] = memoryPair();
  host.addConn(hc);
  const client = new ClientSession(cc, 'Guest');
  let start: { seed: number; players: PlayerSetup[]; you: number } | null = null;
  let lobby: string[] = [];
  const snaps: Snapshot[] = [];
  client.onLobby = (n) => (lobby = n);
  client.onStart = (seed, players, you) => (start = { seed, players, you });
  client.onSnapshot = (s) => snaps.push(s);
  client.join();
  return { host, client, hc, cc, snaps, get start() { return start; }, get lobby() { return lobby; } };
}

describe('networking (in-memory transport)', () => {
  it('lobby lists players and start assigns ids; bots fill to 8', () => {
    const s = setup();
    expect(s.lobby).toEqual(['Host', 'Guest']);
    const players = s.host.start(42, ['Bot-A1', 'Bot-B2', 'Bot-C3', 'Bot-D4', 'Bot-E5', 'Bot-F6', 'Bot-G7']);
    expect(players).toHaveLength(8);
    expect(players.filter((p) => !p.isBot)).toHaveLength(2);
    expect(s.start!.you).toBe(1);
    expect(s.start!.seed).toBe(42);
  });

  it('client inputs move its player on the host; snapshots mirror the host world', () => {
    const s = setup();
    const players = s.host.start(7, ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
    const hostW = createWorld(7, players);
    const mirror = createWorld(7, players);
    const brains = new Map();
    const x0 = hostW.players[1].x;
    for (let t = 0; t < 120; t++) {
      s.client.sendInput({ mx: 1, my: 0, switchTo: null, capital: false }, 1);
      step(hostW, { ...botInputs(hostW, brains), ...s.host.inputs() });
      s.host.afterTick(hostW);
      while (s.snaps.length) {
        const snap = s.snaps.shift()!;
        applySnapshot(mirror, snap);
        s.client.reconcile(snap, 1);
      }
      advanceBullets(mirror, 1 / 30);
    }
    expect(hostW.players[1].x - x0).toBeGreaterThan(700);
    for (const [a, b] of hostW.players.map((p, i) => [p, mirror.players[i]] as const)) {
      expect(Math.abs(a.x - b.x)).toBeLessThan(15);
      expect(a.hp).toBeCloseTo(b.hp, 0);
      expect(b.letters).toEqual(a.letters);
    }
    expect(mirror.copies.map((c) => c.state)).toEqual(hostW.copies.map((c) => c.state));
    const pred = s.client.predicted()!;
    expect(Math.abs(pred.x - hostW.players[1].x)).toBeLessThan(15);
  });

  it('snapshots only carry nearby mobs and send each bullet once', () => {
    const s = setup();
    const players = s.host.start(3, []);
    const w = createWorld(3, players);
    for (let t = 0; t < 90; t++) {
      step(w, {});
      s.host.afterTick(w);
    }
    const me = w.players[1];
    for (const snap of s.snaps) for (const m of snap.m) expect(Math.abs(m[2] - me.x) < 1400 && Math.abs(m[3] - me.y) < 1400).toBe(true);
    const ids = s.snaps.flatMap((x) => x.bn.map((b) => b[0]));
    expect(new Set(ids).size).toBe(ids.length);
    const bytes = JSON.stringify(s.snaps[s.snaps.length - 1]).length;
    expect(bytes).toBeLessThan(12000);
  });

  it('switch and CAPITAL presses are not lost between ticks', () => {
    const s = setup();
    const players = s.host.start(5, []);
    const w = createWorld(5, players);
    const other = w.copies[w.players[1].letters[1]].letter;
    s.client.sendInput({ mx: 0, my: 0, switchTo: other, capital: false }, 1);
    s.client.sendInput({ mx: 0, my: 0, switchTo: null, capital: false }, 1);
    step(w, s.host.inputs());
    expect(w.copies[w.players[1].active!].letter).toBe(other);
  });

  it('a client leaving mid-match drops their letters; leaving the lobby updates it', () => {
    const s = setup();
    const players = s.host.start(9, []);
    const w = createWorld(9, players);
    s.host.onClientLeft = (id) => removePlayer(w, id);
    s.cc.close();
    expect(w.players[1].alive).toBe(false);
    expect(w.players[1].letters).toHaveLength(0);
    const t = setup();
    let names: string[] = [];
    t.host.onLobbyChange = (n) => (names = n);
    t.cc.close();
    expect(names).toEqual(['Host']);
  });

  it('host closing tells clients; full rooms and started matches reject', () => {
    const s = setup();
    let bye = '';
    s.client.onBye = (r) => (bye = r);
    s.host.close();
    expect(bye).toMatch(/host/i);
    const host = new HostSession('H');
    const reasons: string[] = [];
    for (let i = 0; i < MAX_HUMANS + 1; i++) {
      const [hc, cc] = memoryPair();
      host.addConn(hc);
      const c = new ClientSession(cc, `C${i}`);
      c.onBye = (r) => reasons.push(r);
      c.join();
    }
    expect(reasons).toEqual(['The room is full.', 'The room is full.']);
  });
});
