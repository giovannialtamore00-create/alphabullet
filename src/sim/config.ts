/** All tunable numbers. Changes to balance are logged in DECISIONS.md. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export const MAP_SIZE = 8000;
export const MAP_EDGE_SOFT = 150; // px of soft push-back near the map edge
export const MAX_PLAYERS = 8;

export const PLAYER_HP = 100;
export const PLAYER_SPEED = 340;
export const SWITCH_COOLDOWN = 0.5;
export const START_LETTERS = 2;
export const PICKUP_RADIUS = 26;

/** Glyph unit box (1.0) in pixels. */
export const LOWER_SIZE = 54;
export const CAP_SIZE = 74;

export const BULLET = {
  speed: 540,
  life: 1.0, // fallback only; real range comes from stroke length (rangePerUnit)
  rangePerUnit: 1000, // px of range per unit of stroke arm length
  minRange: 140,
  maxRange: 1000,
  capitalRangeMul: 1.2,
  radius: 5,
  baseDps: 46.8, // total damage/sec of a 1-emitter lowercase letter (36 x1.3, playtest 3)
  perExtraEmitterDps: 0, // every letter deals the same total; split evenly between emitters
  baseRate: 6, // shots/sec for 1 emitter; divided by sqrt(emitters)
  shieldLetterDpsMul: 0.4,
  capitalDpsMul: 1.7,
  capitalRadiusMul: 1.6,
  capitalSpeedMul: 1.15,
  /** Short strokes hit harder: x(1 + shortRangeBonus) at minRange, fading linearly to x1 at maxRange. */
  shortRangeBonus: 0.5,
  /** Emitters with an arm this short or shorter (the dot on i/j) fire a shotgun burst instead. */
  dotMaxArm: 0.06,
  dotDmgMul: 2.0, // total burst damage vs. the emitter's normal share (all pellets hitting)
  dotPellets: 6,
  dotSpreadDeg: 70, // full cone width
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
export const PLAYER_LIVES = 3; // deaths allowed; each one costs the active letter, the last eliminates
export const RESPAWN_THRESHOLD = 4; // wave refills once this many (or fewer) remain
export const RESPAWN_DELAY = 120;
export const RESPAWN_MIN_DIST_FROM_OLD = 700;
export const DROP_SCATTER = 110;

export const XP = {
  threshold: 400, // level 1: CAPITAL unlocked
  boldThreshold: 1200, // level 2: BOLD (PLACEHOLDER: total XP, not given in spec)
  perDamage: 1,
  mobKill: 6,
  playerKill: 120,
};

export const CAPITAL_DURATION = 20;
export const CAPITAL_COOLDOWN = 45;
/** Activating CAPITAL grants temporary HP = this x max HP, removed when CAPITAL ends. */
export const CAPITAL_TEMP_HP_FRAC = 0.5;
/** Level 2 BOLD letters: permanent +30% max HP and damage while active (both forms). */
export const BOLD = { hpMul: 1.3, dmgMul: 1.3 };
/** Each mob kill heals this fraction of max HP. */
export const MOB_KILL_HEAL_FRAC = 0.005;
/** Spawn-rate multiplier for players near a letter lying on the ground. */
export const LETTER_AREA_SPAWN_MUL = 1.5;
export const LETTER_AREA_RADIUS = 900;
/** Mobs may spawn this far beyond the map edge and walk in, so edge-huggers still get circled. */
export const MOB_SPAWN_OFFMAP = 1400;

export interface MobTier {
  hp: number;
  speed: number;
  radius: number;
  dmg: number;
}
export const MOB_TIERS: Record<'slender' | 'medium' | 'chunky', MobTier> = {
  slender: { hp: 3.584, speed: 150, radius: 12, dmg: 2 },
  medium: { hp: 10.752, speed: 105, radius: 16, dmg: 3 },
  chunky: { hp: 18.816, speed: 68, radius: 22, dmg: 5 },
};
export const MOB_CONTACT_COOLDOWN = 0.8;
export const MOB_CAP_PER_PLAYER = 60;
export const MOB_CAP_TOTAL = 300;
export const MOB_SPAWN_DIST: [number, number] = [1050, 1300];
export const MOB_DESPAWN_DIST = 2600;
/** Spawns/sec per alive player at time t (seconds): +15% per minute, compounding (playtest 4). */
export const MOB_SPAWN_GROWTH_PER_MIN = 1.15;
export const MOB_SPAWN_RATE_CAP = 3; // PLACEHOLDER: per-player cap, reached at ~11.5 min
export const mobSpawnRate = (t: number) => Math.min(MOB_SPAWN_RATE_CAP, 0.75 * MOB_SPAWN_GROWTH_PER_MIN ** (t / 60));
/** Weight of [slender, medium, chunky] at time t. */
export const mobTierWeights = (t: number): [number, number, number] => [
  Math.max(2, 6 - t / 120) * 1.3, // +30% small mobs
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
  // dps x1.5 in playtest 4 (was 2, 3, 5, 8, 12, 20)
  { wait: 120, shrink: 60, radius: 3200, dps: 3 },
  { wait: 90, shrink: 50, radius: 1800, dps: 4.5 },
  { wait: 75, shrink: 40, radius: 900, dps: 7.5 },
  { wait: 60, shrink: 30, radius: 400, dps: 12 },
  { wait: 45, shrink: 30, radius: 150, dps: 18 },
  { wait: 30, shrink: 30, radius: 0, dps: 30 },
];

export const SPATIAL_CELL = 128;
