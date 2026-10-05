/** All tunable numbers. Changes to balance are logged in DECISIONS.md. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export const MAP_SIZE = 8000;
export const MAP_EDGE_SOFT = 150; // px of soft push-back near the map edge
export const MAX_PLAYERS = 8;

export const PLAYER_HP = 100;
export const PLAYER_SPEED = 200;
export const SWITCH_COOLDOWN = 0.5;
export const START_LETTERS = 2;
export const PICKUP_RADIUS = 26;

/** Glyph unit box (1.0) in pixels. */
export const LOWER_SIZE = 54;
export const CAP_SIZE = 74;

export const BULLET = {
  speed: 540,
  life: 1.0,
  radius: 5,
  baseDps: 36, // total damage/sec of a 1-emitter lowercase letter
  perExtraEmitterDps: 0.1, // +10% total per extra emitter (spread is less focused)
  baseRate: 6, // shots/sec for 1 emitter; divided by sqrt(emitters)
  shieldLetterDpsMul: 0.4,
  capitalDpsMul: 1.7,
  capitalRadiusMul: 1.6,
  capitalSpeedMul: 1.15,
};

export const SHIELD = {
  baseCap: 40, // damage/sec blocked; scaled down by coverage
  coverageFalloff: 0.5, // cap = base * (1 - falloff * coverage), coverage in [0,1]
  capitalMul: 1.75,
};

/** Bullets hurt players less than mobs, so duels last a few seconds and matches reach the late fog. */
export const PVP_DAMAGE_MUL = 0.5;

export const COPIES_PER_LETTER = 2;
export const GROUND_LETTERS = 8;
export const RESPAWN_THRESHOLD = 4; // wave refills once this many (or fewer) remain
export const RESPAWN_DELAY = 120;
export const RESPAWN_MIN_DIST_FROM_OLD = 700;
export const DROP_SCATTER = 110;

export const XP = {
  threshold: 400,
  perDamage: 1,
  mobKill: 6,
  playerKill: 120,
};

export const CAPITAL_DURATION = 20;
export const CAPITAL_COOLDOWN = 45;

export interface MobTier {
  hp: number;
  speed: number;
  radius: number;
  dmg: number;
}
export const MOB_TIERS: Record<'slender' | 'medium' | 'chunky', MobTier> = {
  slender: { hp: 8, speed: 150, radius: 12, dmg: 4 },
  medium: { hp: 24, speed: 105, radius: 16, dmg: 6 },
  chunky: { hp: 60, speed: 68, radius: 22, dmg: 10 },
};
export const MOB_CONTACT_COOLDOWN = 0.8;
export const MOB_CAP_PER_PLAYER = 60;
export const MOB_CAP_TOTAL = 300;
export const MOB_SPAWN_DIST: [number, number] = [1050, 1300];
export const MOB_DESPAWN_DIST = 2600;
/** Spawns/sec per alive player at time t (seconds). */
export const mobSpawnRate = (t: number) => Math.min(1.6, 0.25 + t / 600);
/** Weight of [slender, medium, chunky] at time t. */
export const mobTierWeights = (t: number): [number, number, number] => [
  Math.max(2, 6 - t / 120),
  2 + t / 120,
  0.5 + t / 90,
];

export interface FogStage {
  wait: number;
  shrink: number;
  radius: number;
  dps: number;
}
/** Starts covering the whole map; ~11 minutes until the circle closes. */
export const FOG_START_RADIUS = MAP_SIZE * 0.72;
export const FOG_STAGES: FogStage[] = [
  { wait: 120, shrink: 60, radius: 3200, dps: 2 },
  { wait: 90, shrink: 50, radius: 1800, dps: 3 },
  { wait: 75, shrink: 40, radius: 900, dps: 5 },
  { wait: 60, shrink: 30, radius: 400, dps: 8 },
  { wait: 45, shrink: 30, radius: 150, dps: 12 },
  { wait: 30, shrink: 30, radius: 0, dps: 20 },
];

export const SPATIAL_CELL = 128;
