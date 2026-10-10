import { describe, expect, it } from 'vitest';
import { advanceBullets, applySnapshot, filterEvents, MOB_RANGE_X, MOB_RANGE_Y, NET_VERSION, SLOW_EVERY, type Snapshot } from '../../src/net/protocol';
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

  it('snapshots only carry on-screen mobs; bullets repeat for at most 3 snapshots outside full ones', () => {
    const s = setup();
    const players = s.host.start(3, []);
    const w = createWorld(3, players);
    for (let t = 0; t < 90; t++) {
      step(w, {});
      s.host.afterTick(w);
    }
    const me = w.players[1];
    for (const snap of s.snaps)
      for (let j = 0; j < snap.m.length; j += 5) expect(Math.abs(snap.m[j + 2] - me.x) < MOB_RANGE_X && Math.abs(snap.m[j + 3] - me.y) < MOB_RANGE_Y).toBe(true);
    const counts = new Map<number, number>();
    for (const snap of s.snaps) if (!snap.full) for (const b of snap.bn) counts.set(b[0], (counts.get(b[0]) ?? 0) + 1);
    for (const n of counts.values()) expect(n).toBeLessThanOrEqual(3);
    const bytes = JSON.stringify(s.snaps[s.snaps.length - 1]).length;
    expect(bytes).toBeLessThan(12000);
    expect(s.snaps.filter((x) => x.ps).length).toBeGreaterThanOrEqual(Math.floor(s.snaps.length / SLOW_EVERY));
  });

  it('with 25% of fast messages lost, the guest mirror still matches the host and no event plays twice', () => {
    const host = new HostSession('Host');
    const [hc, cc] = memoryPair({ dropFast: 0.25, seed: 11 });
    host.addConn(hc);
    const client = new ClientSession(cc, 'Guest');
    const snaps: Snapshot[] = [];
    client.onSnapshot = (x) => snaps.push(x);
    client.join();
    const players = host.start(9, ['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
    const hostW = createWorld(9, players);
    const mirror = createWorld(9, players);
    const brains = new Map();
    const net = { evTick: -1 };
    let hostEvents = 0;
    let mirrorEvents = 0;
    let lastFull = false;
    for (let t = 0; t < 300; t++) {
      client.sendInput({ mx: t % 60 < 30 ? 1 : -1, my: 0, switchTo: null, capital: false }, 1);
      step(hostW, { ...botInputs(hostW, brains), ...host.inputs() });
      hostEvents += filterEvents(hostW, hostW.events, { playerId: 1, viewId: 1 } as never).length;
      host.afterTick(hostW);
      while (snaps.length) {
        const snap = snaps.shift()!;
        applySnapshot(mirror, snap, { net });
        mirrorEvents += mirror.events.length;
        client.reconcile(snap, 1);
        lastFull = !!snap.full;
      }
      advanceBullets(mirror, 1 / 30);
      if (t > 240 && lastFull) break; // compare right after a full resync
    }
    expect(lastFull).toBe(true);
    for (const [a, b] of hostW.players.map((p, i) => [p, mirror.players[i]] as const)) {
      expect(Math.abs(a.x - b.x)).toBeLessThan(15);
      expect(b.letters).toEqual(a.letters);
      expect(b.kills).toBe(a.kills);
    }
    expect(mirror.copies.map((c) => c.state)).toEqual(hostW.copies.map((c) => c.state));
    const me = hostW.players[1];
    const mirrorIds = new Set(mirror.bullets.map((b) => b.id));
    const nearHost = hostW.bullets.filter((b) => b.life > 0.1 && Math.abs(b.x - me.x) < 1400 && Math.abs(b.y - me.y) < 1400);
    expect(nearHost.length).toBeGreaterThan(0);
    for (const b of nearHost) expect(mirrorIds.has(b.id)).toBe(true);
    for (const id of mirrorIds) expect(hostW.bullets.some((h) => h.id === id)).toBe(true);
    expect(mirrorEvents).toBeLessThanOrEqual(hostEvents); // never duplicated
    expect(mirrorEvents).toBeGreaterThan(hostEvents * 0.9); // repeats recover nearly all lost batches
  });

  it('late movement inputs are ignored; presses still apply', () => {
    const host = new HostSession('Host');
    const [hc, cc] = memoryPair();
    host.addConn(hc);
    cc.send({ t: 'hello', name: 'G', v: NET_VERSION });
    host.start(1, []);
    cc.send({ t: 'i', q: 5, mx: 1, my: 0, s: null, c: 0, v: 1 });
    cc.send({ t: 'i', q: 4, mx: -1, my: 0, s: null, c: 1, v: 1 });
    const inp = host.inputs()[1];
    expect(inp.mx).toBe(1);
    expect(inp.capital).toBe(true);
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

  it('a guest who drops can rejoin with their token and keeps the same player', async () => {
    const s = setup();
    let tok = '';
    s.client.onStart = (_seed, _p, _you, t) => (tok = t);
    const players = s.host.start(9, []);
    const w = createWorld(9, players);
    const away: boolean[] = [];
    s.host.onClientAway = (_id, a) => away.push(a);
    s.host.onClientLeft = (id) => removePlayer(w, id);
    s.host.graceMs = 50;
    const letters = [...w.players[1].letters];
    expect(tok).not.toBe('');
    s.cc.close(); // refresh / connection lost
    expect(away).toEqual([true]);
    expect(s.host.inputs()[1]).toBeUndefined();
    // New connection with the token.
    const [hc2, cc2] = memoryPair();
    s.host.addConn(hc2);
    const c2 = new ClientSession(cc2, 'Guest', tok);
    let got: { seed: number; you: number } | null = null;
    c2.onStart = (seed, _p, you) => (got = { seed, you });
    c2.join();
    expect(got).toEqual({ seed: 9, you: 1 });
    expect(away).toEqual([true, false]);
    await new Promise((r) => setTimeout(r, 120)); // past the grace time: must not be eliminated
    expect(w.players[1].alive).toBe(true);
    expect(w.players[1].letters).toEqual(letters);
    c2.sendInput({ mx: 1, my: 0, switchTo: null, capital: false }, 1);
    expect(s.host.inputs()[1].mx).toBe(1);
    // A wrong token cannot take the slot.
    const [hc3, cc3] = memoryPair();
    s.host.addConn(hc3);
    let bye = '';
    const c3 = new ClientSession(cc3, 'Evil', 'nope');
    c3.onBye = (r) => (bye = r);
    c3.join();
    expect(bye).toMatch(/started/i);
  });

  it('a client leaving mid-match drops their letters; leaving the lobby updates it', async () => {
    const s = setup();
    const players = s.host.start(9, []);
    const w = createWorld(9, players);
    s.host.onClientLeft = (id) => removePlayer(w, id);
    s.host.graceMs = 0;
    s.cc.close();
    await new Promise((r) => setTimeout(r, 10));
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
