/**
 * Network protocol: compact snapshots (host -> client) and inputs (client -> host).
 * Positions are quantized to integers; only entities near each client are sent.
 * Bullets travel in straight lines, so each one is sent once and then simulated on the client.
 */
import { MOB_TIERS } from '../sim/config';
import { MOB_KEYS, MOBS } from '../sim/glyphs';
import { TIMED_FX, type Bullet, type CopyState, type Mob, type SimEvent, type World } from '../sim/types';
import type { PlayerSetup } from '../sim/world';
import { WORDS } from '../sim/words';

export const NET_VERSION = 8;
export const SNAPSHOT_RANGE = 1400; // px around the client's viewed player
export const EVENT_RANGE = 1600;
/** Mobs are only drawn on screen: a wide box covering the furthest zoom-out (see Renderer zoom). */
export const MOB_RANGE_X = 1300;
export const MOB_RANGE_Y = 850;
/** Rarely changing fields go in every SLOW_EVERY-th snapshot (~4 Hz). */
export const SLOW_EVERY = 5;
/** Every FULL_EVERY-th snapshot (~1 s) resends everything, repairing anything lost on the unreliable channel. */
export const FULL_EVERY = 20;
/** Event batches younger than this many ticks are repeated in each snapshot (3 snapshots). */
const EVENT_KEEP_TICKS = 4;

export type ClientMsg =
  | { t: 'hello'; name: string; v: number; tok?: string }
  | { t: 'i'; q: number; mx: number; my: number; s: string | null; c: 0 | 1; v: number; w?: string | null; b?: string | null };

export type HostMsg =
  | { t: 'lobby'; names: string[]; you: number; max: number }
  | { t: 'start'; seed: number; players: PlayerSetup[]; you: number; tok?: string }
  | { t: 's'; snap: Snapshot }
  | { t: 'bye'; reason: string };

/**
 * Snapshots travel on an unreliable channel, so any one can be lost: bullets and events are
 * repeated for a few snapshots and full snapshots repair the rest.
 */
export interface Snapshot {
  k: number; // tick
  ack: number; // last input seq applied for this client
  full?: 1; // bn holds every live bullet the client should have
  p: number[][]; // fast player fields
  ps?: number[][]; // slow player fields (slow snapshots); ends with word cooldowns in WORDS order, then passive word indices
  pl: number[][]; // letters per player
  c?: number[][]; // all copies (slow snapshots)
  cg: number[][]; // [index, ...copy fields]: nearby ground copies and copies whose state/owner changed since the last slow snapshot
  m: number[]; // flat: id, kind, x, y, hp per mob
  bn: number[][]; // new bullets (repeated for 2 more snapshots)
  bg: number[]; // gone bullet ids (repeated for 2 more snapshots)
  f: number[];
  vd: number[][]; // black holes: id, owner, x, y, t
  wv: number;
  o: number; // over
  w: number; // winner or -1
  e: [number, SimEvent[]][]; // recent event batches by tick; the client applies each tick once
}

/** Bullet effect flags for rendering on the client: 1 pierce, 2 bounce, 4 freeze, 8 disarm, 16 zap, 32 laser. */
function bulletFlags(b: Bullet): number {
  return (b.pierce ? 1 : 0) | (b.bounce ? 2 : 0) | (b.freeze ? 4 : 0) | (b.disarm ? 8 : 0) | (b.zap ? 16 : 0) | (b.laser ? 32 : 0);
}
function flagsToBullet(f: number): Partial<Bullet> {
  return { pierce: !!(f & 1), bounce: f & 2 ? 1 : 0, freeze: !!(f & 4), disarm: !!(f & 8), zap: !!(f & 16), laser: !!(f & 32) };
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
  n: number; // snapshots sent so far (picks slow/full ones)
  newHist: number[][]; // bullet ids first sent in the last 2 snapshots
  goneHist: number[][]; // gone bullet ids from the last 2 snapshots
  evHist: [number, SimEvent[]][]; // recent event batches
  copyBase: number[]; // copy state/owner as of the last slow snapshot
}

export function newClientView(playerId = -1): ClientView {
  return { playerId, viewId: playerId, sentBullets: new Set(), ack: 0, n: 0, newHist: [], goneHist: [], evHist: [], copyBase: [] };
}

/** Per-client snapshot memory on the client side (event dedupe). */
export interface ClientNetState {
  evTick: number;
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

const encodeBullet = (b: Bullet) => [b.id, b.owner, r0(b.x), r0(b.y), r0(b.vx), r0(b.vy), r1(b.r), r2(b.life), b.capital ? 1 : 0, bulletFlags(b)];
const encodeCopy = (c: World['copies'][number]) => [STATES.indexOf(c.state), c.owner ?? -1, r0(c.x), r0(c.y), r0(c.xp), c.upgraded ? 1 : 0, r1(c.capitalTimer), r1(c.capitalCd), c.wave ? 1 : 0, c.bold ? 1 : 0, r1(c.hp), r1(c.idle), r1(c.shuffle)];
const copyKey = (c: World['copies'][number]) => STATES.indexOf(c.state) * 16 + (c.owner ?? -1) + 1;

export function encodeSnapshot(w: World, cv: ClientView, events: SimEvent[]): Snapshot {
  const view = w.players[cv.viewId] ?? w.players[cv.playerId];
  const near = (x: number, y: number) => Math.abs(x - view.x) < SNAPSHOT_RANGE && Math.abs(y - view.y) < SNAPSHOT_RANGE;
  const n = cv.n++;
  const full = n % FULL_EVERY === 0 || w.over;
  const slow = full || n % SLOW_EVERY === 0;

  const byId = new Map(w.bullets.map((b) => [b.id, b]));
  const fresh: number[] = [];
  for (const b of w.bullets) {
    if (cv.sentBullets.has(b.id) || !near(b.x, b.y)) continue;
    cv.sentBullets.add(b.id);
    fresh.push(b.id);
  }
  const gone: number[] = [];
  for (const id of cv.sentBullets)
    if (!byId.has(id)) {
      gone.push(id);
      cv.sentBullets.delete(id);
    }
  // Repeat recent bullets (with their current position) in case the snapshot that introduced them was lost.
  const sendIds = full ? [...cv.sentBullets] : [...new Set([...cv.newHist.flat(), ...fresh])];
  cv.newHist = [...cv.newHist, fresh].slice(-2);
  const bg = [...new Set([...cv.goneHist.flat(), ...gone])];
  cv.goneHist = [...cv.goneHist, gone].slice(-2);
  const bn: number[][] = [];
  for (const id of sendIds) {
    const b = byId.get(id);
    if (b) bn.push(encodeBullet(b));
  }

  const batch = filterEvents(w, events, cv);
  if (batch.length) cv.evHist.push([w.tick, batch]);
  cv.evHist = cv.evHist.filter(([k]) => k > w.tick - EVENT_KEEP_TICKS);

  const cg: number[][] = [];
  if (slow) cv.copyBase = w.copies.map(copyKey);
  else w.copies.forEach((c, i) => (c.state === 'ground' && near(c.x, c.y)) || copyKey(c) !== cv.copyBase[i] ? cg.push([i, ...encodeCopy(c)]) : 0);

  const m: number[] = [];
  for (const mob of w.mobs)
    if (Math.abs(mob.x - view.x) < MOB_RANGE_X && Math.abs(mob.y - view.y) < MOB_RANGE_Y) m.push(mob.id, MOB_KEYS.indexOf(mob.kind), r0(mob.x), r0(mob.y), r0(mob.hp));

  const f = w.fog;
  const s: Snapshot = {
    k: w.tick,
    ack: cv.ack,
    p: w.players.map((p) => [
      r0(p.x),
      r0(p.y),
      r1(p.hp),
      p.alive ? 1 : 0,
      p.active ?? -1,
      p.inFog ? 1 : 0,
      r2(p.morph),
      r1(p.shieldBudget),
      r1(p.maxHp),
      r1(p.tempHp),
      p.lives,
      r1(p.spawnProt),
      ...TIMED_FX.map((k) => r1(p.fx[k])),
      r2(p.slow),
      r1(p.disarmT),
      r1(p.splashT),
    ]),
    pl: w.players.map((p) => p.letters),
    cg,
    m,
    bn,
    bg,
    f: [r0(f.x), r0(f.y), r0(f.r), r0(f.toX), r0(f.toY), r0(f.toR), ['wait', 'shrink', 'done'].indexOf(f.phase), r1(f.timer), f.stage, f.dps],
    vd: w.voids.map((h) => [h.id, h.owner, r0(h.x), r0(h.y), r2(h.t)]),
    wv: w.wave.timer === null ? -1 : r1(w.wave.timer),
    o: w.over ? 1 : 0,
    w: w.winner ?? -1,
    e: cv.evHist.slice(),
  };
  if (full) s.full = 1;
  if (slow) {
    s.ps = w.players.map((p) => [
      p.placement ?? 0,
      p.kills,
      p.mobKills,
      p.lettersCollected,
      p.deathTime ?? -1,
      ...WORDS.map((d) => r1(p.wordCd[d.word] ?? 0)),
      ...p.passives.map((x) => WORDS.findIndex((d) => d.word === x)),
    ]);
    s.c = w.copies.map(encodeCopy);
  }
  return s;
}

/** Apply a snapshot to the client's mirror world (built with createWorld from the same seed). */
export function applySnapshot(w: World, s: Snapshot, opts: { keepLocal?: number; net?: ClientNetState } = {}): void {
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
    p.morph = a[6];
    p.shieldBudget = a[7];
    p.maxHp = a[8];
    p.tempHp = a[9];
    p.lives = a[10];
    p.spawnProt = a[11];
    const n = TIMED_FX.length;
    TIMED_FX.forEach((k, m) => (p.fx[k] = a[12 + m]));
    p.slow = a[12 + n];
    p.disarmT = a[13 + n];
    p.splashT = a[14 + n];
    p.letters = s.pl[i] ?? [];
  });
  s.ps?.forEach((a, i) => {
    const p = w.players[i];
    if (!p) return;
    p.placement = a[0] || null;
    p.kills = a[1];
    p.mobKills = a[2];
    p.lettersCollected = a[3];
    p.deathTime = a[4] < 0 ? null : a[4];
    WORDS.forEach((d, k) => (p.wordCd[d.word] = a[5 + k]));
    p.passives = a.slice(5 + WORDS.length).map((k) => WORDS[k].word);
  });
  const copies = s.c ? s.c.map((a, i) => [i, ...a]) : s.cg;
  copies.forEach(([i, ...a]) => {
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
    c.hp = a[10];
    c.idle = a[11] ?? 0;
    c.shuffle = a[12] ?? 0;
  });
  const old = new Map(w.mobs.map((m) => [m.id, m]));
  const mobs: Mob[] = [];
  for (let j = 0; j + 4 < s.m.length; j += 5) {
    const [id, k, x, y, hp] = s.m.slice(j, j + 5);
    const kind = MOB_KEYS[k];
    const tier = MOBS[kind].tier;
    const t = MOB_TIERS[tier];
    const m: Mob = old.get(id) ?? { id, kind, tier, x, y, hp, maxHp: t.hp, r: t.radius, speed: t.speed, dmg: t.dmg, contactCd: 0, lastHitBy: null, lastHitCopy: null };
    m.x = x;
    m.y = y;
    m.hp = hp;
    mobs.push(m);
  }
  w.mobs = mobs;
  const gone = new Set(s.bg);
  const keep = s.full ? new Set(s.bn.map((b) => b[0])) : null;
  w.bullets = w.bullets.filter((b) => !gone.has(b.id) && (!keep || keep.has(b.id)));
  const have = new Set(w.bullets.map((b) => b.id));
  for (const [id, owner, x, y, vx, vy, r, life, cap, fl] of s.bn) {
    if (have.has(id)) continue; // repeat of a bullet we already simulate
    const b: Bullet = { id, owner, copyId: -1, x, y, vx, vy, r, dmg: 0, life, capital: !!cap, ...flagsToBullet(fl) };
    w.bullets.push(b);
  }
  w.voids = s.vd.map(([id, owner, x, y, t]) => ({ id, owner, x, y, t }));
  const f = w.fog;
  [f.x, f.y, f.r, f.toX, f.toY, f.toR] = s.f;
  f.phase = (['wait', 'shrink', 'done'] as const)[s.f[6]];
  f.timer = s.f[7];
  f.stage = s.f[8];
  f.dps = s.f[9];
  w.wave.timer = s.wv < 0 ? null : s.wv;
  w.over = !!s.o;
  w.winner = s.w < 0 ? null : s.w;
  // Event batches repeat across snapshots; apply each host tick once.
  const net = opts.net ?? { evTick: -1 };
  w.events = [];
  for (const [k, evs] of s.e)
    if (k > net.evTick) {
      w.events.push(...evs);
      net.evTick = k;
    }
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
