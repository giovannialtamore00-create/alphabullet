/** World creation and the fixed-timestep step function. Pure: no DOM, no rendering. */
import {
  CAPITAL_COOLDOWN,
  CAPITAL_DURATION,
  CAPITAL_TEMP_HP_FRAC,
  BOLD,
  BULLET,
  DT,
  MAP_SIZE,
  PLAYER_HP,
  PLAYER_SPEED,
  PVP_DAMAGE_MUL,
  SPATIAL_CELL,
  START_LETTERS,
  SWITCH_COOLDOWN,
  XP,
} from './config';
import { activeCopy, activeForm, creditXp, damageMob, damagePlayer, playerRadius, selectLetter } from './combat';
import { createFog, updateFog } from './fog';

import { createCopies, drawFromPool, dropCopy, dropLetters, findSpot, giveCopy, spawnWave, updatePickups, updateWave } from './letters';
import { makeMob, updateMobs } from './mobs';
import { Rng } from './rng';
import { SpatialHash } from './spatialHash';
import { NO_INPUT, type Mob, type Player, type PlayerInput, type World } from './types';

export interface PlayerSetup {
  name: string;
  isBot: boolean;
}

export function createWorld(seed: number, setups: PlayerSetup[], opts: { mobs?: boolean } = {}): World {
  const rng = new Rng(seed);
  const w: World = {
    seed,
    tick: 0,
    time: 0,
    rng,
    players: [],
    copies: createCopies(),
    mobs: [],
    bullets: [],
    fog: createFog(rng),
    wave: { timer: null, spots: [] },
    events: [],
    over: false,
    winner: null,
    nextId: 1,
    mobsEnabled: opts.mobs ?? true,
  };
  const n = setups.length;
  const base = rng.next() * Math.PI * 2;
  const slots = rng.shuffle([...Array(n).keys()]);
  setups.forEach((s, i) => {
    const ang = base + (slots[i] / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const rad = 2600 + rng.range(-300, 300);
    const p: Player = {
      id: i,
      name: s.name,
      isBot: s.isBot,
      x: MAP_SIZE / 2 + Math.cos(ang) * rad,
      y: MAP_SIZE / 2 + Math.sin(ang) * rad,
      hp: PLAYER_HP,
      maxHp: PLAYER_HP,
      tempHp: 0,
      alive: true,
      letters: [],
      active: null,
      switchCd: 0,
      morph: 10,
      fireTimer: 0.5,
      shieldBudget: 0,
      lastDamager: null,
      mobAcc: 0,
      inFog: false,
      kills: 0,
      mobKills: 0,
      lettersCollected: 0,
      damageDealt: 0,
      deathTime: null,
      placement: null,
      god: false,
    };
    w.players.push(p);
  });
  // Starting letters: 2 distinct random letters each, from the shared pool.
  for (const p of w.players)
    for (let k = 0; k < START_LETTERS; k++) {
      const c = drawFromPool(w, new Set(p.letters.map((id) => w.copies[id].letter)));
      if (c) giveCopy(w, p, c);
    }
  spawnWave(w);
  return w;
}

function endCapital(w: World, p: Player): void {
  const c = activeCopy(w, p);
  p.tempHp = 0;
  if (c && c.capitalTimer > 0) {
    c.capitalTimer = 0;
    c.capitalCd = CAPITAL_COOLDOWN;
    w.events.push({ t: 'capital', id: p.id, letter: c.letter, on: false });
  }
}

/** One tick of 8-way movement, clamped to the map. Shared with client-side prediction. */
export function moveStep(x: number, y: number, mxIn: number, myIn: number): { x: number; y: number } {
  let mx = Math.sign(mxIn);
  let my = Math.sign(myIn);
  if (mx && my) {
    mx *= Math.SQRT1_2;
    my *= Math.SQRT1_2;
  }
  return {
    x: Math.min(MAP_SIZE - 20, Math.max(20, x + mx * PLAYER_SPEED * DT)),
    y: Math.min(MAP_SIZE - 20, Math.max(20, y + my * PLAYER_SPEED * DT)),
  };
}

function applyInput(w: World, p: Player, inp: PlayerInput): void {
  p.switchCd -= DT;
  p.morph += DT;
  if (inp.switchTo && p.switchCd <= 0) {
    const target = p.letters.find((id) => w.copies[id].letter === inp.switchTo);
    if (target !== undefined && target !== p.active) {
      endCapital(w, p);
      selectLetter(w, p, target);
      p.switchCd = SWITCH_COOLDOWN;
      p.morph = 0;
      const rate = activeForm(w, p)!.bullet.rate;
      p.fireTimer = Math.min(p.fireTimer, 1 / rate);
      w.events.push({ t: 'switch', id: p.id, letter: inp.switchTo });
    }
  }
  const c = activeCopy(w, p);
  if (inp.capital && c && c.upgraded && c.capitalTimer <= 0 && c.capitalCd <= 0) {
    c.capitalTimer = CAPITAL_DURATION;
    p.tempHp = p.maxHp * CAPITAL_TEMP_HP_FRAC;
    p.morph = 0;
    w.events.push({ t: 'capital', id: p.id, letter: c.letter, on: true });
  }
  const pos = moveStep(p.x, p.y, inp.mx, inp.my);
  p.x = pos.x;
  p.y = pos.y;
  const form = activeForm(w, p);
  const cap = form?.shieldCap ?? 0;
  p.shieldBudget = Math.min(cap, p.shieldBudget + cap * DT);
}

function updateCopies(w: World): void {
  for (const c of w.copies) {
    if (c.capitalCd > 0) c.capitalCd = Math.max(0, c.capitalCd - DT);
    if (c.capitalTimer > 0) {
      c.capitalTimer -= DT;
      if (c.capitalTimer <= 0) {
        c.capitalTimer = 0;
        c.capitalCd = CAPITAL_COOLDOWN;
        if (c.owner !== null) w.players[c.owner].tempHp = 0;
        if (c.owner !== null) w.events.push({ t: 'capital', id: c.owner, letter: c.letter, on: false });
      }
    }
  }
}

function fire(w: World): void {
  for (const p of w.players) {
    if (!p.alive || p.active === null) continue;
    const form = activeForm(w, p)!;
    const b = form.bullet;
    p.fireTimer -= DT;
    while (p.fireTimer <= 0) {
      p.fireTimer += 1 / b.rate;
      const boldMul = w.copies[p.active].bold ? BOLD.dmgMul : 1;
      for (const e of form.emitters) {
        const ang0 = Math.atan2(e.dy, e.dx);
        const spread = e.pellets > 1 ? (BULLET.dotSpreadDeg * Math.PI) / 180 : 0;
        for (let k = 0; k < e.pellets; k++) {
          const ang = e.pellets > 1 ? ang0 - spread / 2 + (spread * k) / (e.pellets - 1) : ang0;
          w.bullets.push({
            id: w.nextId++,
            owner: p.id,
            copyId: p.active,
            x: p.x + e.x * form.size,
            y: p.y + e.y * form.size,
            vx: e.pellets > 1 ? Math.cos(ang) * b.speed : e.dx * b.speed,
            vy: e.pellets > 1 ? Math.sin(ang) * b.speed : e.dy * b.speed,
            r: b.radius,
            dmg: (b.dmg * e.dmgMul * boldMul) / e.pellets,
            life: e.range / b.speed,
            capital: form.capital,
          });
        }
      }
      w.events.push({ t: 'shot', owner: p.id, x: p.x, y: p.y, capital: form.capital });
    }
  }
}

type Target = { x: number; y: number; r: number; mob: Mob | null; player: Player | null };
const targetHash = new SpatialHash<Target>(SPATIAL_CELL);
const found: Target[] = [];
const MAX_TARGET_R = 48;

function updateBullets(w: World): void {
  targetHash.clear();
  for (const m of w.mobs) if (m.hp > 0) targetHash.insert({ x: m.x, y: m.y, r: m.r, mob: m, player: null });
  for (const p of w.players)
    if (p.alive) targetHash.insert({ x: p.x, y: p.y, r: playerRadius(w, p), mob: null, player: p });
  let j = 0;
  for (const b of w.bullets) {
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.life -= DT;
    if (b.life <= 0 || b.x < 0 || b.y < 0 || b.x > MAP_SIZE || b.y > MAP_SIZE) continue;
    let hit = false;
    targetHash.query(b.x, b.y, b.r + MAX_TARGET_R, found);
    for (const t of found) {
      if (t.player && (t.player.id === b.owner || !t.player.alive)) continue;
      if (t.mob && t.mob.hp <= 0) continue;
      if (Math.hypot(t.x - b.x, t.y - b.y) > t.r + b.r) continue;
      const shooter = w.players[b.owner];
      const dealt = t.mob
        ? damageMob(w, t.mob, b.dmg, b.owner, b.copyId)
        : damagePlayer(w, t.player!, b.dmg * PVP_DAMAGE_MUL, b.x - b.vx * DT, b.y - b.vy * DT, b.owner);
      shooter.damageDealt += dealt;
      creditXp(w, b.owner, b.copyId, dealt * XP.perDamage);
      hit = true;
      break;
    }
    if (!hit) w.bullets[j++] = b;
  }
  w.bullets.length = j;
}

/** Letter-loss respawn keeps this distance from other players when it can. */
const RESPAWN_AVOID_PLAYERS = 1200; // PLACEHOLDER

/**
 * The active letter ran out of HP (ink) but the player owns others: that letter drops on the floor,
 * and the player respawns somewhere else with their healthiest remaining letter.
 */
function loseActiveLetter(w: World, p: Player): void {
  const c = activeCopy(w, p)!;
  endCapital(w, p);
  const killer = p.lastDamager !== null ? p.lastDamager : null;
  w.events.push({ t: 'letterLost', id: p.id, letter: c.letter, x: p.x, y: p.y, by: killer });
  p.letters = p.letters.filter((id) => id !== c.id);
  p.active = null;
  dropCopy(w, c, p.x, p.y);
  const next = p.letters.reduce((a, b) => (w.copies[b].hp > w.copies[a].hp ? b : a)); // healthiest letter
  selectLetter(w, p, next);
  const spot = findSpot(
    w,
    w.players.filter((q) => q.alive && q.id !== p.id).map((q) => ({ x: q.x, y: q.y, d: RESPAWN_AVOID_PLAYERS })),
  );
  p.x = spot.x;
  p.y = spot.y;
  p.tempHp = 0;
  p.shieldBudget = 0;
  p.morph = 0;
  p.lastDamager = null;
}

function resolveDeaths(w: World): void {
  for (const p of w.players)
    if (p.alive && p.hp <= 0 && p.letters.some((id) => id !== p.active && w.copies[id].hp > 0)) loseActiveLetter(w, p);
  const dying = w.players.filter((p) => p.alive && p.hp <= 0);
  if (!dying.length) return;
  // Most-dead first, so the least-dead of a simultaneous group places best.
  dying.sort((a, b) => a.hp - b.hp || b.id - a.id);
  const aliveAfter = w.players.filter((p) => p.alive && p.hp > 0).length;
  dying.forEach((p, i) => {
    p.alive = false;
    p.tempHp = 0;
    p.deathTime = w.time;
    p.placement = aliveAfter + dying.length - i;
    const killer = p.lastDamager !== null ? w.players[p.lastDamager] : null;
    if (killer && killer.id !== p.id) {
      killer.kills++;
      creditXp(w, killer.id, killer.active, XP.playerKill);
    }
    w.events.push({ t: 'playerDeath', id: p.id, x: p.x, y: p.y, by: killer ? killer.id : null });
    dropLetters(w, p);
  });
}

function checkWin(w: World): void {
  if (w.players.length < 2) return;
  const alive = w.players.filter((p) => p.alive);
  if (alive.length > 1) return;
  if (alive.length === 1) alive[0].placement = 1;
  const winner = w.players.find((p) => p.placement === 1) ?? null;
  w.over = true;
  w.winner = winner ? winner.id : null;
  w.events.push({ t: 'matchOver', winner: w.winner });
}

/** Advance the world by one fixed tick. `inputs` is indexed by player id. */
export function step(w: World, inputs: Record<number, PlayerInput>): void {
  w.events = [];
  if (w.over) return;
  w.tick++;
  w.time = w.tick * DT;
  for (const p of w.players) if (p.alive) applyInput(w, p, inputs[p.id] ?? NO_INPUT);
  updateCopies(w);
  fire(w);
  updateBullets(w);
  updateMobs(w, DT);
  updateFog(w, DT);
  updatePickups(w);
  updateWave(w, DT);
  resolveDeaths(w);
  checkWin(w);
}

/** Remove a player (disconnect): drops letters like a death. */
export function removePlayer(w: World, id: number): void {
  const p = w.players[id];
  if (!p || !p.alive) return;
  p.hp = 0;
  p.lastDamager = null;
  const keep = p.active ?? p.letters[0];
  for (const id of p.letters) if (id !== keep) dropCopy(w, w.copies[id], p.x, p.y);
  p.letters = keep === undefined ? [] : [keep]; // a single letter left means elimination, not a respawn
  resolveDeaths(w);
  checkWin(w);
}

// ---- Debug helpers (used by ?debug mode and tests) ----

export function debugGiveLetter(w: World, id: number, letter: string): boolean {
  const p = w.players[id];
  if (!p?.alive || p.letters.some((c) => w.copies[c].letter === letter)) return false;
  const c =
    w.copies.find((k) => k.letter === letter && k.state === 'pool') ??
    w.copies.find((k) => k.letter === letter && k.state === 'ground');
  if (!c) return false;
  giveCopy(w, p, c);
  return true;
}

export function debugUpgradeActive(w: World, id: number): void {
  const c = activeCopy(w, w.players[id]);
  if (c && !c.upgraded) {
    c.xp = XP.threshold;
    c.upgraded = true;
    c.capitalCd = 0;
    w.events.push({ t: 'upgrade', id, letter: c.letter });
  }
}

export function debugBoldActive(w: World, id: number): void {
  const c = activeCopy(w, w.players[id]);
  if (!c) return;
  debugUpgradeActive(w, id);
  creditXp(w, id, c.id, Math.max(0, XP.boldThreshold - c.xp));
}

export function debugSpawnMobs(w: World, x: number, y: number, count: number, kind?: string): void {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const k = kind ?? ['/', '%', '#', '@', '!', '='][i % 6];
    w.mobs.push(makeMob(w, k, x + Math.cos(ang) * 400, y + Math.sin(ang) * 400));
  }
}


/** Cheap deterministic fingerprint of the world, for replay tests. */
export function hashWorld(w: World): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  return JSON.stringify([
    w.tick,
    w.rng.state,
    w.players.map((p) => [r(p.x), r(p.y), r(p.hp), p.letters, p.active, p.alive]),
    w.copies.map((c) => [c.state, c.owner, r(c.x), r(c.y), r(c.xp)]),
    w.mobs.length,
    w.bullets.length,
    [r(w.fog.x), r(w.fog.y), r(w.fog.r)],
  ]);
}
