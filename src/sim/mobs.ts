/** Keyboard-symbol mobs: spawn off-screen around players, swarm the nearest one, melee on touch. */
import {
  MAP_SIZE,
  MOB_CAP_PER_PLAYER,
  MOB_CAP_PER_SCREEN,
  SCREEN_AREA,
  MOB_CONTACT_COOLDOWN,
  MOB_DESPAWN_DIST,
  MOB_SPAWN_DIST,
  MOB_TIERS,
  LETTER_AREA_RADIUS,
  LETTER_AREA_SPAWN_MUL,
  MOB_KILL_HEAL_FRAC,
  MOB_SPAWN_OFFMAP,
  SPATIAL_CELL,
  XP,
  mobSpawnRate,
  mobTierWeights,
} from './config';
import { creditXp, damagePlayer, playerRadius } from './combat';
import { MOB_KEYS, MOBS, type MobTierName } from './glyphs';
import { SpatialHash } from './spatialHash';
import type { Mob, World } from './types';

const TIERS: MobTierName[] = ['slender', 'medium', 'chunky'];
const KINDS_BY_TIER: Record<MobTierName, string[]> = {
  slender: MOB_KEYS.filter((k) => MOBS[k].tier === 'slender'),
  medium: MOB_KEYS.filter((k) => MOBS[k].tier === 'medium'),
  chunky: MOB_KEYS.filter((k) => MOBS[k].tier === 'chunky'),
};

export function makeMob(w: World, kind: string, x: number, y: number): Mob {
  const tier = MOBS[kind].tier;
  const t = MOB_TIERS[tier];
  return {
    id: w.nextId++,
    kind,
    tier,
    x,
    y,
    hp: t.hp,
    maxHp: t.hp,
    r: t.radius,
    speed: t.speed,
    dmg: t.dmg,
    contactCd: 0,
    lastHitBy: null,
    lastHitCopy: null,
  };
}

function pickKind(w: World): string {
  const weights = mobTierWeights(w.time);
  let r = w.rng.next() * (weights[0] + weights[1] + weights[2]);
  let i = 0;
  while (i < 2 && r >= weights[i]) r -= weights[i++];
  return w.rng.pick(KINDS_BY_TIER[TIERS[i]]);
}

function spawnMobs(w: World, dt: number): void {
  const alive = w.players.filter((p) => p.alive);
  // Global cap follows walkable space: map area, or the fog circle once it is smaller.
  const walkable = Math.min(MAP_SIZE * MAP_SIZE, Math.PI * w.fog.r * w.fog.r);
  const cap = Math.min((MOB_CAP_PER_SCREEN * walkable) / SCREEN_AREA, MOB_CAP_PER_PLAYER * alive.length);
  const rate = mobSpawnRate(w.time);
  const ground = w.copies.filter((c) => c.state === 'ground');
  for (const p of alive) {
    // Letters lying on the ground attract more mobs until someone picks them up.
    const nearLetter = ground.some((c) => Math.abs(c.x - p.x) < LETTER_AREA_RADIUS && Math.abs(c.y - p.y) < LETTER_AREA_RADIUS && Math.hypot(c.x - p.x, c.y - p.y) < LETTER_AREA_RADIUS);
    p.mobAcc += rate * (nearLetter ? LETTER_AREA_SPAWN_MUL : 1) * dt;
    while (p.mobAcc >= 1) {
      p.mobAcc -= 1;
      if (w.mobs.length >= cap) continue;
      const ang = w.rng.next() * Math.PI * 2;
      const d = w.rng.range(MOB_SPAWN_DIST[0], MOB_SPAWN_DIST[1]);
      const x = p.x + Math.cos(ang) * d;
      const y = p.y + Math.sin(ang) * d;
      // Off-map spawns are allowed (mobs walk in), so players at the edge are still surrounded.
      const o = MOB_SPAWN_OFFMAP;
      if (x < -o || y < -o || x > MAP_SIZE + o || y > MAP_SIZE + o) continue;
      w.mobs.push(makeMob(w, pickKind(w), x, y));
    }
  }
}

const hash = new SpatialHash<Mob>(SPATIAL_CELL);
const near: Mob[] = [];

export function updateMobs(w: World, dt: number): void {
  if (w.mobsEnabled) spawnMobs(w, dt);
  const alive = w.players.filter((p) => p.alive);
  hash.clear();
  for (const m of w.mobs) hash.insert(m);
  for (const m of w.mobs) {
    m.contactCd -= dt;
    let target = null;
    let best = Infinity;
    for (const p of alive) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d < best) {
        best = d;
        target = p;
      }
    }
    if (m.slowT) {
      m.slowT = Math.max(0, m.slowT - dt);
      if (m.slowT <= 0) m.slow = 0;
    }
    if (!target || best > MOB_DESPAWN_DIST) {
      m.hp = 0; // despawn: no reward
      m.lastHitBy = null;
      continue;
    }
    if (best > 1) {
      const sp = m.speed * (1 - (m.slow ?? 0));
      m.x += ((target.x - m.x) / best) * sp * dt;
      m.y += ((target.y - m.y) / best) * sp * dt;
    }
    // Separation so swarms spread instead of stacking.
    hash.query(m.x, m.y, m.r * 2, near);
    for (const o of near) {
      if (o === m) continue;
      const dx = m.x - o.x;
      const dy = m.y - o.y;
      const d = Math.hypot(dx, dy);
      const min = m.r + o.r;
      if (d > 0.01 && d < min) {
        const push = ((min - d) / d) * 0.5;
        m.x += dx * push;
        m.y += dy * push;
      }
    }
    if (m.contactCd <= 0)
      for (const p of alive) {
        if (Math.hypot(p.x - m.x, p.y - m.y) < m.r + playerRadius(w, p)) {
          damagePlayer(w, p, m.dmg, m.x, m.y, null);
          m.contactCd = MOB_CONTACT_COOLDOWN;
          break;
        }
      }
  }
  removeDeadMobs(w);
}

/** Remove dead mobs; killed ones (hp <= 0 with a killer) reward the killer. */
export function removeDeadMobs(w: World): void {
  let j = 0;
  for (const m of w.mobs) {
    if (m.hp > 0) {
      w.mobs[j++] = m;
      continue;
    }
    if (m.lastHitBy !== null) {
      w.events.push({ t: 'mobDeath', kind: m.kind, x: m.x, y: m.y, by: m.lastHitBy });
      const killer = w.players.find((p) => p.id === m.lastHitBy);
      if (killer) {
        killer.mobKills++;
        if (killer.alive) killer.hp = Math.min(killer.maxHp, killer.hp + killer.maxHp * MOB_KILL_HEAL_FRAC);
        creditXp(w, killer.id, m.lastHitCopy, XP.mobKill);
      }
    }
  }
  w.mobs.length = j;
}
