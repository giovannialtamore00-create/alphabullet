/** All tunable numbers. Changes to balance are logged in DECISIONS.md. */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export const MAP_SIZE = 8000;
export const MAP_EDGE_SOFT = 150; // px of soft push-back near the map edge
export const MAX_PLAYERS = 8;

export const PLAYER_HP = 100;
export const PLAYER_SPEED = 374; // +10% (patch)
export const SWITCH_COOLDOWN = 0.5;
export const START_LETTERS = 2;
export const PICKUP_RADIUS = 26;

/** Glyph unit box (1.0) in pixels. */
export const LOWER_SIZE = 54;
export const CAP_SIZE = 74;

export const BULLET = {
  speed: 540,
  life: 1.0, // fallback only; real range comes from stroke length (rangePerUnit)
  rangePerUnit: 1250, // px of range per unit of stroke arm length (x1.25 patch)
  minRange: 175, // x1.25 patch
  maxRange: 1250, // x1.25 patch
  capitalRangeMul: 1.2,
  radius: 5,
  baseDps: 73.008, // total damage/sec of a 1-emitter lowercase letter (46.8 x1.3 balance patch, then x1.2)
  perExtraEmitterDps: 0, // every letter deals the same total; split evenly between emitters
  baseRate: 6.9, // +15% (patch); shots/sec for 1 emitter; divided by sqrt(emitters)
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
export const PVP_DAMAGE_MUL = 0.6; // +20% (patch)

export const COPIES_PER_LETTER = 2;
/** Vowels that show up more: 4 copies each and a 15% higher chance when a letter is drawn. */
export const VOWELS = ['O', 'A', 'I', 'E'];
export const VOWEL_COPIES = 4;
export const VOWEL_WEIGHT = 1.15;
/** Draw weight x0.85 for consonants used by at most one word power; each owned copy of a letter divides its weight by (1 + OWNED_PENALTY * owned). */
export const UNDERUSED_WEIGHT = 0.85;
export const OWNED_PENALTY = 2;
/** Every `every` seconds `count` pool letters appear on the map, up to `groundCap` lying on the ground. */
export const LETTER_SPAWN = { every: 20, count: 3, groundCap: 16 }; // groundCap PLACEHOLDER
export const GROUND_LETTERS = 8;
export const PLAYER_LIVES = 3; // deaths allowed; each one costs the active letter, the last eliminates
/** Seconds of invulnerability after a letter-loss respawn. */
export const SPAWN_PROTECTION = 2; // PLACEHOLDER
export const RESPAWN_MIN_DIST_FROM_OLD = 700;
export const DROP_SCATTER = 110;
/** Letters dropped by dead players: after `wait` s on the ground they flash for `flash` s (faster and faster), then vanish back to the pool. */
export const DROP_DECAY = { wait: 7, flash: 3 };

export const XP = {
  threshold: 400, // level 1: BOLD
  capitalThreshold: 1200, // level 2: CAPITAL unlocked (PLACEHOLDER: total XP)
  perDamage: 1.25, // +25% (patch), applies to every XP source
  mobKill: 7.5,
  playerKill: 150,
  letterBreak: 75, // breaking a letter (the victim loses a life but respawns). PLACEHOLDER
};

export const CAPITAL_DURATION = 13; // was 20, -35% (patch)
export const CAPITAL_COOLDOWN = 45;
/** Activating CAPITAL grants temporary HP = this x max HP, removed when CAPITAL ends. */
export const CAPITAL_TEMP_HP_FRAC = 0.5;
/** Level 1 BOLD letters: 25% bigger bullets, nothing else. */
export const BOLD = { bulletRadiusMul: 1.25 };
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
/** Coexisting mobs allowed per screen-sized patch (1600x900) of walkable space; the global cap scales with map/fog area. */
export const MOB_CAP_PER_SCREEN = 60;
export const SCREEN_AREA = 1600 * 900;
export const MOB_SPAWN_DIST: [number, number] = [1050, 1300];
export const MOB_DESPAWN_DIST = 2600;
/** Spawns/sec per alive player at time t (seconds): +15% per minute, compounding (playtest 4). */
export const MOB_SPAWN_GROWTH_PER_MIN = 1.18; // was 1.15, escalation +20% (patch)
export const MOB_SPAWN_RATE_CAP = 3; // PLACEHOLDER: per-player cap, reached at ~11.5 min
export const MOB_SPAWN_MUL = 3.4; // +70% (patch), then +100% (M20)
/** Extra spawns early (+30% at t=0) fading to fewer late (-30% from 10 min on), linear in between. */
export const MOB_SPAWN_EARLY_MUL = 1.3;
export const MOB_SPAWN_LATE_MUL = 0.7;
export const MOB_SPAWN_LATE_AT = 600;
export const mobPhaseMul = (t: number) => MOB_SPAWN_EARLY_MUL + (MOB_SPAWN_LATE_MUL - MOB_SPAWN_EARLY_MUL) * Math.min(1, Math.max(0, t / MOB_SPAWN_LATE_AT));
/** Flat rate, no escalation over time (patch). */
export const mobSpawnRate = (_t: number) => MOB_SPAWN_MUL * MOB_SPAWN_EARLY_MUL * 0.75 * 2;
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
export const FOG_SPEED = 1.4; // fog timeline runs 40% faster (patch): wait and shrink times are divided by this
export const FOG_STAGES: FogStage[] = ([
  // dps x1.5 in playtest 4 (was 2, 3, 5, 8, 12, 20)
  { wait: 30 * FOG_SPEED, shrink: 60, radius: 3200, dps: 3 },
  { wait: 117, shrink: 50, radius: 1800, dps: 4.5 },
  { wait: 97.5, shrink: 40, radius: 900, dps: 7.5 },
  { wait: 78, shrink: 30, radius: 400, dps: 12 },
  { wait: 58.5, shrink: 30, radius: 150, dps: 18 },
  { wait: 39, shrink: 30, radius: 0, dps: 30 },
] as FogStage[]).map((s) => ({ ...s, wait: s.wait / FOG_SPEED, shrink: s.shrink / FOG_SPEED }));

export const SPATIAL_CELL = 128;

/** Word powers: own every letter of the word, then type it. All PLACEHOLDER. */
export const WORD_IMMUNITY = 0.5; // seconds of invulnerability when a word power fires
export const WORD_TYPE_WINDOW = 1; // max seconds between typed letters of a word
export const PIERCE = { duration: 6, cooldown: 30 };
export const BOMB = { radius: 300, dmg: 60, cooldown: 25 };
export const DASH = { dist: 350, cooldown: 8 };
/** PUSH: everything within `radius` is shoved `dist` px straight away from the caster. PLACEHOLDER numbers. */
export const PUSH = { radius: 400, dist: 350, cooldown: 15 };
/** Timed word powers last `duration` seconds. All PLACEHOLDER except the durations the user set. */
export const BOUNCE = { duration: 8, cooldown: 30, bounces: 2, minLife: 0.35 }; // bounces off targets and map edges
export const FREEZE = { duration: 8, cooldown: 30, perHit: 0.05, max: 0.2, slowTime: 1.5 };
export const ERASE = { duration: 8, cooldown: 40, radius: 200 };
/** Black hole: arms for `arm` s, then pulls for `pull` s; whatever is still inside `radius` is swallowed. */
export const VOID = { cooldown: 50, arm: 2, pull: 4, radius: 450, pullEdge: 120, pullCore: 800 };
export const SPLASH = { duration: 5, cooldown: 40, cover: 0.6, botSight: 0.4 };
export const DISARM = { duration: 8, cooldown: 35, lock: 2 };
export const SPEED = { duration: 12, cooldown: 30, mul: 1.35 };
export const LIFE = { cooldown: 60 };
export const ZAP = { duration: 8, cooldown: 30, range: 170, jumps: 2, dmgMul: 0.5 };
export const SPIN = { duration: 8, cooldown: 30, revPerSec: 0.5 };
export const FLIP = { duration: 12, cooldown: 25 };
export const MAGNET = { duration: 12, cooldown: 30, radius: 1000, speed: 500 };
/** JETPACK: fast spin, faster fire, and recoil that pushes the player opposite the average shot direction. PLACEHOLDER numbers. */
export const JET = { duration: 5, cooldown: 40, revPerSec: 3, fireMul: 2.5, kick: 260, drag: 3 };
/** EXILE: other players inside this box around the caster (the camera view at zoom 1) are teleported at least `minDist` away. */
export const EXILE = { cooldown: 45, halfW: 800, halfH: 450, minDist: 2000 };
/** XRAY: the caster's X letter fires piercing, unlimited-range lasers. */
export const XRAY = { duration: 3, cooldown: 45, speedMul: 3, radiusMul: 0.6 };
/** CHUNKY: bigger body (and hitbox) and bigger bullets. Duration and cooldown PLACEHOLDER. */
export const CHUNKY = { duration: 10, cooldown: 30, sizeMul: 1.2, bulletMul: 1.3 };
