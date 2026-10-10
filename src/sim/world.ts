/** World creation and the fixed-timestep step function. Pure: no DOM, no rendering. */
import {
  CAPITAL_COOLDOWN,
  CAPITAL_DURATION,
  CAPITAL_TEMP_HP_FRAC,
  BOLD,
  BOUNCE,
  BULLET,
  CHUNKY,
  DISARM,
  ERASE,
  DT,
  JET,
  MAP_SIZE,
  PLAYER_HP,
  PLAYER_LIVES,
  SPAWN_PROTECTION,
  PLAYER_SPEED,
  PVP_DAMAGE_MUL,
  SPATIAL_CELL,
  START_LETTERS,
  SWITCH_COOLDOWN,
  VOID,
  XP,
  XRAY,
  ZAP,
} from './config';
import { activeCopy, activeForm, addSlow, bodyMul, creditXp, damageMob, damagePlayer, glyphPose, playerRadius, posePoint, selectLetter, speedMul } from './combat';
import { createFog, updateFog } from './fog';
import { refreshPassives, useWord } from './words';

import { createCopies, drawFromPool, dropCopy, dropLetters, findSpot, giveCopy, spawnWave, updateDropDecay, updatePickups, updateShuffle, updateWave } from './letters';
import { makeMob, updateMobs } from './mobs';
import { Rng } from './rng';
import { SpatialHash } from './spatialHash';
import { NO_INPUT, TIMED_FX, noFx, type Bullet, type Mob, type Player, type PlayerInput, type World } from './types';

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
    voids: [],
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
      lives: PLAYER_LIVES,
      spawnProt: 0,
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
      wordCd: {},
      passives: [],
      fx: noFx(),
      slow: 0,
      slowT: 0,
      disarmT: 0,
      splashT: 0,
      faceX: 0,
      faceY: -1,
      jetVx: 0,
      jetVy: 0,
      xrayBack: null,
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
export function moveStep(x: number, y: number, mxIn: number, myIn: number, mul = 1): { x: number; y: number } {
  let mx = Math.sign(mxIn);
  let my = Math.sign(myIn);
  if (mx && my) {
    mx *= Math.SQRT1_2;
    my *= Math.SQRT1_2;
  }
  return {
    x: Math.min(MAP_SIZE - 20, Math.max(20, x + mx * PLAYER_SPEED * mul * DT)),
    y: Math.min(MAP_SIZE - 20, Math.max(20, y + my * PLAYER_SPEED * mul * DT)),
  };
}

/** Switch the active letter to an owned copy of `letter`, if not already active. */
function switchLetter(w: World, p: Player, letter: string): void {
  const target = p.letters.find((id) => w.copies[id].letter === letter);
  if (target === undefined || target === p.active) return;
  endCapital(w, p);
  selectLetter(w, p, target);
  p.switchCd = SWITCH_COOLDOWN;
  p.morph = 0;
  const rate = activeForm(w, p)!.bullet.rate;
  p.fireTimer = Math.min(p.fireTimer, 1 / rate);
  w.events.push({ t: 'switch', id: p.id, letter });
}

function applyInput(w: World, p: Player, inp: PlayerInput): void {
  p.switchCd -= DT;
  p.morph += DT;
  if (inp.switchTo && p.switchCd <= 0) switchLetter(w, p, inp.switchTo);
  const c = activeCopy(w, p);
  if (inp.capital && c && c.upgraded && c.capitalTimer <= 0 && c.capitalCd <= 0) {
    c.capitalTimer = CAPITAL_DURATION;
    p.tempHp = p.maxHp * CAPITAL_TEMP_HP_FRAC;
    p.morph = 0;
    w.events.push({ t: 'capital', id: p.id, letter: c.letter, on: true });
  }
  for (const k in p.wordCd) p.wordCd[k] = Math.max(0, p.wordCd[k] - DT);
  const xrayOn = p.fx.xray > 0;
  for (const k of TIMED_FX) p.fx[k] = Math.max(0, p.fx[k] - DT);
  if (xrayOn && p.fx.xray <= 0 && p.xrayBack) {
    switchLetter(w, p, p.xrayBack);
    p.xrayBack = null;
  }
  refreshPassives(w, p);
  p.disarmT = Math.max(0, p.disarmT - DT);
  p.splashT = Math.max(0, p.splashT - DT);
  p.slowT = Math.max(0, p.slowT - DT);
  if (p.slowT <= 0) p.slow = 0;
  if (inp.mx || inp.my) {
    const len = Math.hypot(inp.mx, inp.my);
    p.faceX = inp.mx / len;
    p.faceY = inp.my / len;
  }
  const before = activeCopy(w, p)?.letter ?? null;
  if (inp.word && useWord(w, p, inp.word) && inp.word === 'XRAY') {
    // XRAY: fire from the X letter until the lasers run out, then return to the letter held before.
    p.xrayBack = inp.wordBack ?? before;
    switchLetter(w, p, 'X');
  }
  // After typing a word, go back to the letter held before it (ignores the switch cooldown).
  if (inp.word && inp.wordBack && p.alive && p.fx.xray <= 0) switchLetter(w, p, inp.wordBack);
  const pos = moveStep(p.x, p.y, inp.mx, inp.my, speedMul(p));
  // JETPACK recoil drifts the player on top of its own movement; it cannot be steered.
  p.jetVx *= Math.max(0, 1 - JET.drag * DT);
  p.jetVy *= Math.max(0, 1 - JET.drag * DT);
  p.x = Math.min(MAP_SIZE - 20, Math.max(20, pos.x + p.jetVx * DT));
  p.y = Math.min(MAP_SIZE - 20, Math.max(20, pos.y + p.jetVy * DT));
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
    if (p.disarmT > 0) continue;
    const b = form.bullet;
    const pose = glyphPose(p);
    p.fireTimer -= DT;
    while (p.fireTimer <= 0) {
      p.fireTimer += 1 / (p.fx.xray > 0 ? XRAY.rate : b.rate * (p.fx.jet > 0 ? JET.fireMul : 1));
      let sx = 0;
      let sy = 0;
      const boldR = w.copies[p.active].bold ? BOLD.bulletRadiusMul : 1;
      for (const e of form.emitters) {
        const [edx, edy] = posePoint(pose, e.dx, e.dy);
        const [ex, ey] = posePoint(pose, e.x * form.size * bodyMul(p), e.y * form.size * bodyMul(p));
        const ang0 = Math.atan2(edy, edx);
        const spread = e.pellets > 1 ? (BULLET.dotSpreadDeg * Math.PI) / 180 : 0;
        for (let k = 0; k < e.pellets; k++) {
          const ang = e.pellets > 1 ? ang0 - spread / 2 + (spread * k) / (e.pellets - 1) : ang0;
          const laser = p.fx.xray > 0;
          const sp = b.speed * (laser ? XRAY.speedMul : 1);
          sx += Math.cos(ang);
          sy += Math.sin(ang);
          w.bullets.push({
            id: w.nextId++,
            owner: p.id,
            copyId: p.active,
            x: p.x + ex,
            y: p.y + ey,
            vx: e.pellets > 1 ? Math.cos(ang) * sp : edx * sp,
            vy: e.pellets > 1 ? Math.sin(ang) * sp : edy * sp,
            r: b.radius * boldR * (p.fx.chunky > 0 ? CHUNKY.bulletMul : 1) * (laser ? XRAY.radiusMul : 1),
            // XRAY fires XRAY.rate times a second: scale so the ray deals XRAY.dmgMul x the letter's normal damage per second.
            dmg: ((b.dmg * e.dmgMul) / e.pellets) * (laser ? (XRAY.dmgMul * b.rate) / XRAY.rate : 1),
            life: laser ? (MAP_SIZE * 1.5) / sp : e.range / b.speed,
            capital: form.capital,
            pierce: p.fx.pierce > 0 || laser,
            laser,
            bounce: p.fx.bounce > 0 ? BOUNCE.bounces : 0,
            freeze: p.fx.freeze > 0,
            disarm: p.fx.disarm > 0,
            zap: p.fx.zap > 0,
          });
        }
      }
      if (p.fx.jet > 0) {
        const n = Math.hypot(sx, sy);
        if (n > 1e-6) {
          p.jetVx -= (sx / n) * JET.kick * (n / form.emitters.length);
          p.jetVy -= (sy / n) * JET.kick * (n / form.emitters.length);
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

/** ZAP: from the hit target, jump to the nearest unhit targets in range, hurting each for a fraction of the bullet. */
function zapChain(w: World, b: Bullet, from: Target): void {
  const visited = new Set<unknown>([from.mob ?? from.player]);
  const pts: number[] = [];
  let cx = from.x;
  let cy = from.y;
  for (let jump = 0; jump < ZAP.maxJumps; jump++) {
    let best: Target | null = null;
    let bestD = ZAP.range;
    const cands: Target[] = [];
    for (const m of w.mobs) if (m.hp > 0) cands.push({ x: m.x, y: m.y, r: m.r, mob: m, player: null });
    for (const q of w.players) if (q.alive && q.id !== b.owner) cands.push({ x: q.x, y: q.y, r: 0, mob: null, player: q });
    for (const t of cands) {
      if (visited.has(t.mob ?? t.player)) continue;
      const d = Math.hypot(t.x - cx, t.y - cy);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    if (!best) break;
    visited.add(best.mob ?? best.player);
    const dmg = b.dmg * ZAP.dmgMul;
    const dealt = best.mob ? damageMob(w, best.mob, dmg, b.owner, b.copyId) : damagePlayer(w, best.player!, dmg * PVP_DAMAGE_MUL, cx, cy, b.owner);
    w.players[b.owner].damageDealt += dealt;
    creditXp(w, b.owner, b.copyId, dealt * XP.perDamage);
    pts.push(best.x, best.y);
    cx = best.x;
    cy = best.y;
  }
  if (pts.length) w.events.push({ t: 'zap', x: from.x, y: from.y, pts, by: b.owner });
}

/** Bullet bounced: keep it alive a little longer so a bounce is visible, one bounce used. */
function bounced(w: World, b: Bullet): void {
  b.id = w.nextId++; // new id: the host resends it to guests with its new direction
  b.bounce = (b.bounce ?? 0) - 1;
  b.life = Math.max(b.life, BOUNCE.minLife);
}

function updateBullets(w: World): void {
  targetHash.clear();
  for (const m of w.mobs) if (m.hp > 0) targetHash.insert({ x: m.x, y: m.y, r: m.r, mob: m, player: null });
  for (const p of w.players)
    if (p.alive) targetHash.insert({ x: p.x, y: p.y, r: playerRadius(w, p), mob: null, player: p });
  const erasers = w.players.filter((p) => p.alive && p.fx.erase > 0);
  let j = 0;
  for (const b of w.bullets) {
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    b.life -= DT;
    if (b.life <= 0) continue;
    if (b.x < 0 || b.y < 0 || b.x > MAP_SIZE || b.y > MAP_SIZE) {
      if (!b.bounce || b.bounce <= 0) continue;
      if (b.x < 0 || b.x > MAP_SIZE) b.vx = -b.vx;
      if (b.y < 0 || b.y > MAP_SIZE) b.vy = -b.vy;
      b.x = Math.min(MAP_SIZE, Math.max(0, b.x));
      b.y = Math.min(MAP_SIZE, Math.max(0, b.y));
      bounced(w, b);
    }
    // ERASE: enemy bullets inside the circle of a player with the effect vanish.
    if (erasers.some((e) => e.id !== b.owner && (e.x - b.x) ** 2 + (e.y - b.y) ** 2 <= ERASE.radius * ERASE.radius)) continue;
    let hit = false;
    targetHash.query(b.x, b.y, b.r + MAX_TARGET_R, found);
    for (const t of found) {
      if (t.player && (t.player.id === b.owner || !t.player.alive)) continue;
      if (t.mob && t.mob.hp <= 0) continue;
      if (Math.hypot(t.x - b.x, t.y - b.y) > t.r + b.r) continue;
      const tid = t.mob ? t.mob.id : -1 - t.player!.id;
      if (b.pierce && b.hitIds?.includes(tid)) continue;
      const shooter = w.players[b.owner];
      const dealt = t.mob
        ? damageMob(w, t.mob, b.dmg, b.owner, b.copyId)
        : damagePlayer(w, t.player!, b.dmg * PVP_DAMAGE_MUL, b.x - b.vx * DT, b.y - b.vy * DT, b.owner);
      shooter.damageDealt += dealt;
      creditXp(w, b.owner, b.copyId, dealt * XP.perDamage);
      if (b.freeze) addSlow(t.mob ?? t.player!);
      if (b.disarm && t.player) t.player.disarmT = DISARM.lock;
      if (b.zap) zapChain(w, b, t);
      if (b.pierce) {
        // PIERCE: keep flying, but never hit the same target twice.
        (b.hitIds ??= []).push(tid);
        continue;
      }
      if (b.bounce && b.bounce > 0) {
        // BOUNCE: reflect off the target (away from its centre) and fly on.
        const nx = b.x - t.x;
        const ny = b.y - t.y;
        const len = Math.hypot(nx, ny) || 1;
        const dot = (b.vx * nx + b.vy * ny) / (len * len);
        b.vx -= 2 * dot * nx;
        b.vy -= 2 * dot * ny;
        b.x = t.x + (nx / len) * (t.r + b.r + 1);
        b.y = t.y + (ny / len) * (t.r + b.r + 1);
        bounced(w, b);
        break;
      }
      hit = true;
      break;
    }
    if (!hit) w.bullets[j++] = b;
  }
  w.bullets.length = j;
}

/** VOID: after arming, pull everything in range toward the centre; at the end swallow what is left inside. */
function updateVoids(w: World): void {
  const r2 = VOID.radius * VOID.radius;
  w.voids = w.voids.filter((h) => {
    h.t += DT;
    if (h.t < VOID.arm) return true;
    const end = h.t >= VOID.arm + VOID.pull;
    const pull = (o: { x: number; y: number }): boolean => {
      const dx = h.x - o.x;
      const dy = h.y - o.y;
      const d = Math.hypot(dx, dy);
      if (d * d > r2) return false;
      if (!end && d > 1) {
        const f = d / VOID.radius;
        const move = Math.min(d, (VOID.pullCore + (VOID.pullEdge - VOID.pullCore) * f) * DT);
        o.x += (dx / d) * move;
        o.y += (dy / d) * move;
      }
      return true;
    };
    let eaten = 0;
    for (const m of w.mobs)
      if (m.hp > 0 && pull(m) && end) {
        damageMob(w, m, m.hp + 1, h.owner, null);
        eaten++;
      }
    for (const p of w.players)
      if (p.alive && p.id !== h.owner && pull(p) && end && !p.god && p.spawnProt <= 0) {
        p.hp = 0;
        p.tempHp = 0;
        p.lastDamager = h.owner;
        eaten++;
      }
    if (end) w.events.push({ t: 'voidEat', hole: h.id, x: h.x, y: h.y, n: eaten });
    return !end;
  });
}

/** Letter-loss respawn keeps this distance from other players when it can. */
const RESPAWN_AVOID_PLAYERS = 1200; // PLACEHOLDER

/**
 * The active letter ran out of HP (ink) and the player has lives left: one life is spent, that letter drops
 * on the floor, and the player respawns somewhere else with their healthiest remaining letter
 * (or a fresh letter from the pool if it was their only one).
 */
function loseActiveLetter(w: World, p: Player): void {
  const c = activeCopy(w, p)!;
  endCapital(w, p);
  const killer = p.lastDamager !== null ? p.lastDamager : null;
  w.events.push({ t: 'letterLost', id: p.id, letter: c.letter, x: p.x, y: p.y, by: killer });
  if (killer !== null && killer !== p.id) {
    // Breaking a letter counts as a kill and gives XP, even though the victim respawns.
    w.players[killer].kills++;
    creditXp(w, killer, w.players[killer].active, XP.letterBreak);
  }
  p.letters = p.letters.filter((id) => id !== c.id);
  p.active = null;
  dropCopy(w, c, p.x, p.y);
  p.lives--;
  if (!p.letters.length) giveCopy(w, p, drawFromPool(w, new Set([c.letter])) ?? drawFromPool(w) ?? c); // last resort: same letter
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
  p.spawnProt = SPAWN_PROTECTION;
  p.jetVx = 0;
  p.jetVy = 0;
}

function resolveDeaths(w: World): void {
  for (const p of w.players)
    if (p.alive && p.hp <= 0 && p.lives > 1) loseActiveLetter(w, p);
  const dying = w.players.filter((p) => p.alive && p.hp <= 0);
  if (!dying.length) return;
  // Most-dead first, so the least-dead of a simultaneous group places best.
  dying.sort((a, b) => a.hp - b.hp || b.id - a.id);
  const aliveAfter = w.players.filter((p) => p.alive && p.hp > 0).length;
  dying.forEach((p, i) => {
    p.alive = false;
    p.lives = 0;
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
  for (const p of w.players) {
    if (!p.alive) continue;
    p.spawnProt = Math.max(0, p.spawnProt - DT);
    applyInput(w, p, inputs[p.id] ?? NO_INPUT);
  }
  updateCopies(w);
  fire(w);
  updateBullets(w);
  updateVoids(w);
  updateMobs(w, DT);
  updateFog(w, DT);
  updatePickups(w);
  updateShuffle(w, DT);
  updateWave(w, DT);
  updateDropDecay(w, DT);
  resolveDeaths(w);
  checkWin(w);
}

/** Remove a player (disconnect): drops letters like a death. */
export function removePlayer(w: World, id: number): void {
  const p = w.players[id];
  if (!p || !p.alive) return;
  p.hp = 0;
  p.lives = 0; // disconnect always eliminates
  p.lastDamager = null;
  const keep = p.active ?? p.letters[0];
  for (const id of p.letters) if (id !== keep) dropCopy(w, w.copies[id], p.x, p.y);
  p.letters = keep === undefined ? [] : [keep];
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
    c.xp = XP.capitalThreshold;
    c.bold = true;
    c.upgraded = true;
    c.capitalCd = 0;
    w.events.push({ t: 'upgrade', id, letter: c.letter });
  }
}

export function debugBoldActive(w: World, id: number): void {
  const c = activeCopy(w, w.players[id]);
  if (!c) return;
  creditXp(w, id, c.id, Math.max(0, XP.threshold - c.xp));
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
