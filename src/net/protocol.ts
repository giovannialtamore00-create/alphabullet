/**
 * Network protocol: compact snapshots (host -> client) and inputs (client -> host).
 * Positions are quantized to integers; only entities near each client are sent.
 * Bullets travel in straight lines, so each one is sent once and then simulated on the client.
 */
import { MOB_TIERS } from '../sim/config';
import { MOB_KEYS, MOBS } from '../sim/glyphs';
import type { Bullet, CopyState, Mob, SimEvent, World } from '../sim/types';
import type { PlayerSetup } from '../sim/world';

export const NET_VERSION = 1;
export const SNAPSHOT_RANGE = 1400; // px around the client's viewed player
export const EVENT_RANGE = 1600;

export type ClientMsg =
  | { t: 'hello'; name: string; v: number }
  | { t: 'i'; q: number; mx: number; my: number; s: string | null; c: 0 | 1; v: number };

export type HostMsg =
  | { t: 'lobby'; names: string[]; you: number; max: number }
  | { t: 'start'; seed: number; players: PlayerSetup[]; you: number }
  | { t: 's'; snap: Snapshot }
  | { t: 'bye'; reason: string };

export interface Snapshot {
  k: number; // tick
  ack: number; // last input seq applied for this client
  p: number[][];
  pl: number[][]; // letters per player
  c: number[][];
  m: number[][];
  bn: number[][]; // new bullets
  bg: number[]; // gone bullet ids
  f: number[];
  wv: number;
  o: number; // over
  w: number; // winner or -1
  e: SimEvent[];
}

const STATES: CopyState[] = ['pool', 'ground', 'owned'];
const r0 = Math.round;
const r1 = (v: number) => Math.round(v * 10) / 10;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Per-client bookkeeping kept by the host. */
export interface ClientView {
  playerId: number;
  viewId: number;
  sentBullets: Set<number>;
  ack: number;
}

function eventPos(w: World, e: SimEvent): { x: number; y: number } | null {
  if ('x' in e) return { x: e.x, y: e.y };
  if ('id' in e) {
    const p = w.players[e.id];
    return p ? { x: p.x, y: p.y } : null;
  }
  return null;
}

export function filterEvents(w: World, events: SimEvent[], cv: ClientView): SimEvent[] {
  const view = w.players[cv.viewId] ?? w.players[cv.playerId];
  return events.filter((e) => {
    if (e.t === 'playerDeath' || e.t === 'matchOver' || e.t === 'fogStage' || e.t === 'letterWave') return true;
    if ('id' in e && e.id === cv.playerId) return true;
    if ('by' in e && e.by === cv.playerId) return true;
    const pos = eventPos(w, e);
    return !!pos && Math.abs(pos.x - view.x) < EVENT_RANGE && Math.abs(pos.y - view.y) < EVENT_RANGE;
  });
}

export function encodeSnapshot(w: World, cv: ClientView, events: SimEvent[]): Snapshot {
  const view = w.players[cv.viewId] ?? w.players[cv.playerId];
  const near = (x: number, y: number) => Math.abs(x - view.x) < SNAPSHOT_RANGE && Math.abs(y - view.y) < SNAPSHOT_RANGE;
  const bn: number[][] = [];
  const alive = new Set<number>();
  for (const b of w.bullets) {
    alive.add(b.id);
    if (cv.sentBullets.has(b.id) || !near(b.x, b.y)) continue;
    cv.sentBullets.add(b.id);
    bn.push([b.id, b.owner, r0(b.x), r0(b.y), r0(b.vx), r0(b.vy), r1(b.r), r2(b.life), b.capital ? 1 : 0]);
  }
  const bg: number[] = [];
  for (const id of cv.sentBullets)
    if (!alive.has(id)) {
      bg.push(id);
      cv.sentBullets.delete(id);
    }
  const f = w.fog;
  return {
    k: w.tick,
    ack: cv.ack,
    p: w.players.map((p) => [
      r0(p.x),
      r0(p.y),
      r1(p.hp),
      p.alive ? 1 : 0,
      p.active ?? -1,
      p.inFog ? 1 : 0,
      p.placement ?? 0,
      p.kills,
      p.mobKills,
      p.lettersCollected,
      r2(p.morph),
      p.deathTime ?? -1,
      r1(p.shieldBudget),
      r1(p.maxHp),
      r1(p.tempHp),
    ]),
    pl: w.players.map((p) => p.letters),
    c: w.copies.map((c) => [STATES.indexOf(c.state), c.owner ?? -1, r0(c.x), r0(c.y), r0(c.xp), c.upgraded ? 1 : 0, r1(c.capitalTimer), r1(c.capitalCd), c.wave ? 1 : 0, c.bold ? 1 : 0]),
    m: w.mobs.filter((m) => near(m.x, m.y)).map((m) => [m.id, MOB_KEYS.indexOf(m.kind), r0(m.x), r0(m.y), r0(m.hp)]),
    bn,
    bg,
    f: [r0(f.x), r0(f.y), r0(f.r), r0(f.toX), r0(f.toY), r0(f.toR), ['wait', 'shrink', 'done'].indexOf(f.phase), r1(f.timer), f.stage, f.dps],
    wv: w.wave.timer === null ? -1 : r1(w.wave.timer),
    o: w.over ? 1 : 0,
    w: w.winner ?? -1,
    e: filterEvents(w, events, cv),
  };
}

/** Apply a snapshot to the client's mirror world (built with createWorld from the same seed). */
export function applySnapshot(w: World, s: Snapshot, opts: { keepLocal?: number } = {}): void {
  w.tick = s.k;
  w.time = s.k / 30;
  s.p.forEach((a, i) => {
    const p = w.players[i];
    if (!p) return;
    if (i !== opts.keepLocal || !a[3]) {
      p.x = a[0];
      p.y = a[1];
    }
    p.hp = a[2];
    p.alive = !!a[3];
    p.active = a[4] < 0 ? null : a[4];
    p.inFog = !!a[5];
    p.placement = a[6] || null;
    p.kills = a[7];
    p.mobKills = a[8];
    p.lettersCollected = a[9];
    p.morph = a[10];
    p.deathTime = a[11] < 0 ? null : a[11];
    p.shieldBudget = a[12];
    p.maxHp = a[13];
    p.tempHp = a[14];
    p.letters = s.pl[i] ?? [];
  });
  s.c.forEach((a, i) => {
    const c = w.copies[i];
    c.state = STATES[a[0]];
    c.owner = a[1] < 0 ? null : a[1];
    c.x = a[2];
    c.y = a[3];
    c.xp = a[4];
    c.upgraded = !!a[5];
    c.capitalTimer = a[6];
    c.capitalCd = a[7];
    c.wave = !!a[8];
    c.bold = !!a[9];
  });
  const old = new Map(w.mobs.map((m) => [m.id, m]));
  w.mobs = s.m.map(([id, k, x, y, hp]) => {
    const kind = MOB_KEYS[k];
    const tier = MOBS[kind].tier;
    const t = MOB_TIERS[tier];
    const m: Mob = old.get(id) ?? { id, kind, tier, x, y, hp, maxHp: t.hp, r: t.radius, speed: t.speed, dmg: t.dmg, contactCd: 0, lastHitBy: null, lastHitCopy: null };
    m.x = x;
    m.y = y;
    m.hp = hp;
    return m;
  });
  const gone = new Set(s.bg);
  w.bullets = w.bullets.filter((b) => !gone.has(b.id));
  for (const [id, owner, x, y, vx, vy, r, life, cap] of s.bn) {
    const b: Bullet = { id, owner, copyId: -1, x, y, vx, vy, r, dmg: 0, life, capital: !!cap };
    w.bullets.push(b);
  }
  const f = w.fog;
  [f.x, f.y, f.r, f.toX, f.toY, f.toR] = s.f;
  f.phase = (['wait', 'shrink', 'done'] as const)[s.f[6]];
  f.timer = s.f[7];
  f.stage = s.f[8];
  f.dps = s.f[9];
  w.wave.timer = s.wv < 0 ? null : s.wv;
  w.over = !!s.o;
  w.winner = s.w < 0 ? null : s.w;
  w.events = s.e;
}

/** Client-side bullet motion between snapshots. */
export function advanceBullets(w: World, dt: number): void {
  let j = 0;
  for (const b of w.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life > 0) w.bullets[j++] = b;
  }
  w.bullets.length = j;
}
