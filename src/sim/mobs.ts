/** Keyboard-symbol mobs: spawn off-screen around players, swarm the nearest one, melee on touch. */
import {
  MAP_SIZE,
  MOB_CAP_PER_PLAYER,
  MOB_CAP_TOTAL,
  MOB_CONTACT_COOLDOWN,
  MOB_DESPAWN_DIST,
  MOB_SPAWN_DIST,
  MOB_TIERS,
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
  const cap = Math.min(MOB_CAP_TOTAL, MOB_CAP_PER_PLAYER * alive.length);
  const rate = mobSpawnRate(w.time);
  for (const p of alive) {
    p.mobAcc += rate * dt;
    while (p.mobAcc >= 1) {
      p.mobAcc -= 1;
      if (w.mobs.length >= cap) continue;
      const ang = w.rng.next() * Math.PI * 2;
      const d = w.rng.range(MOB_SPAWN_DIST[0], MOB_SPAWN_DIST[1]);
      const x = p.x + Math.cos(ang) * d;
      const y = p.y + Math.sin(ang) * d;
      if (x < 0 || y < 0 || x > MAP_SIZE || y > MAP_SIZE) continue;
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
    if (!target || best > MOB_DESPAWN_DIST) {
      m.hp = 0; // despawn: no reward
      m.lastHitBy = null;
      continue;
    }
    if (best > 1) {
      m.x += ((target.x - m.x) / best) * m.speed * dt;
      m.y += ((target.y - m.y) / best) * m.speed * dt;
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
        creditXp(w, killer.id, m.lastHitCopy, XP.mobKill);
      }
    }
  }
  w.mobs.length = j;
}
