import type { Rng } from './rng';
import type { MobTierName } from './glyphs';

/** One tick of input. Humans and bots produce exactly this; the sim cannot tell them apart. */
export interface PlayerInput {
  mx: number; // -1, 0, 1
  my: number; // -1, 0, 1
  switchTo: string | null; // capital letter key, e.g. 'A'
  capital: boolean; // Shift pressed this tick
  word?: string | null; // word power typed this tick, e.g. 'DASH'
  wordBack?: string | null; // letter held before typing the word; switched back to after it
}
/** Word powers that last a while; their timers live in Player.fx (order = network order). */
export const TIMED_FX = ['pierce', 'bounce', 'freeze', 'erase', 'disarm', 'speed', 'zap', 'spin', 'flip', 'magnet', 'jet', 'xray', 'chunky'] as const;
export type TimedFx = (typeof TIMED_FX)[number];
export const noFx = (): Record<TimedFx, number> => Object.fromEntries(TIMED_FX.map((k) => [k, 0])) as Record<TimedFx, number>;

export const NO_INPUT: PlayerInput = { mx: 0, my: 0, switchTo: null, capital: false };

export interface Player {
  id: number;
  name: string;
  isBot: boolean;
  x: number;
  y: number;
  hp: number; // HP (ink) of the active letter; each owned letter keeps its own pool in LetterCopy.hp
  maxHp: number; // 100, or x1.3 while a BOLD letter is active
  tempHp: number; // CAPITAL bonus HP, absorbed before hp
  alive: boolean;
  lives: number; // remaining lives; reaching 0 eliminates
  spawnProt: number; // seconds of invulnerability left after a respawn
  letters: number[]; // copy ids
  active: number | null; // copy id
  switchCd: number;
  morph: number; // seconds since last switch (render)
  fireTimer: number;
  shieldBudget: number;
  lastDamager: number | null;
  mobAcc: number; // mob spawn accumulator
  inFog: boolean;
  kills: number;
  mobKills: number;
  lettersCollected: number;
  damageDealt: number;
  deathTime: number | null;
  placement: number | null;
  god: boolean;
  wordCd: Record<string, number>; // seconds left per word power
  /** Seconds left of each timed word power this player cast on itself. */
  fx: Record<TimedFx, number>;
  slow: number; // FREEZE slow received, 0..FREEZE.max
  slowT: number; // seconds until the slow wears off
  disarmT: number; // seconds of DISARM received: cannot fire
  splashT: number; // seconds of SPLASH ink on this player's screen
  faceX: number; // last movement direction (unit vector), used by DASH
  faceY: number;
  jetVx: number; // JETPACK recoil velocity (px/s), host only
  jetVy: number;
  xrayBack: string | null; // letter to return to when XRAY ends, host only
}

export type CopyState = 'pool' | 'ground' | 'owned';
export interface LetterCopy {
  id: number; // index in world.copies
  letter: string;
  xp: number;
  upgraded: boolean; // level 1
  bold: boolean; // level 2
  state: CopyState;
  owner: number | null;
  x: number;
  y: number;
  wave: boolean; // counts toward the 8 map letters (false for death drops)
  idle: number; // seconds a death drop has lain on the ground (decays after DROP_DECAY)
  capitalTimer: number;
  capitalCd: number;
  hp: number; // own HP pool; for the owner's active letter the live value is Player.hp
}

export interface Mob {
  id: number;
  kind: string;
  tier: MobTierName;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  dmg: number;
  contactCd: number;
  lastHitBy: number | null;
  lastHitCopy: number | null;
  slow?: number; // FREEZE slow, 0..FREEZE.max
  slowT?: number;
}

export interface Bullet {
  id: number;
  owner: number;
  copyId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  capital: boolean;
  pierce?: boolean; // passes through targets (PIERCE word)
  bounce?: number; // bounces left (BOUNCE word)
  freeze?: boolean; // slows what it hits (FREEZE word)
  disarm?: boolean; // stops a hit player from firing (DISARM word)
  zap?: boolean; // chains to nearby targets on hit (ZAP word)
  laser?: boolean; // XRAY: drawn as a long beam
  hitIds?: number[]; // targets a pierce bullet already hit (mob id, or -1 - player id)
}

/** VOID black hole. `t` counts up from 0: arming until VOID.arm, pulling until VOID.arm + VOID.pull. */
export interface VoidHole {
  id: number;
  owner: number;
  x: number;
  y: number;
  t: number;
}

export interface Fog {
  stage: number; // index into FOG_STAGES of the circle currently targeted
  phase: 'wait' | 'shrink' | 'done';
  timer: number; // seconds left in phase
  x: number;
  y: number;
  r: number;
  fromX: number;
  fromY: number;
  fromR: number;
  toX: number;
  toY: number;
  toR: number;
  dps: number;
}

export interface LetterWave {
  timer: number | null; // seconds until refill, null = not running
  spots: { x: number; y: number }[]; // spots used by the previous wave
}

export type SimEvent =
  | { t: 'shot'; owner: number; x: number; y: number; capital: boolean }
  | { t: 'hit'; target: 'mob' | 'player'; id: number; x: number; y: number; dmg: number; by: number | null }
  | { t: 'mobDeath'; kind: string; x: number; y: number; by: number | null }
  | { t: 'playerDeath'; id: number; x: number; y: number; by: number | null }
  | { t: 'letterLost'; id: number; letter: string; x: number; y: number; by: number | null }
  | { t: 'pickup'; id: number; letter: string; x: number; y: number }
  | { t: 'switch'; id: number; letter: string }
  | { t: 'upgrade'; id: number; letter: string }
  | { t: 'bold'; id: number; letter: string }
  | { t: 'capital'; id: number; letter: string; on: boolean }
  | { t: 'shieldBlock'; id: number; x: number; y: number; amount: number; angle: number }
  | { t: 'word'; id: number; word: string; x: number; y: number; fromX: number; fromY: number }
  | { t: 'zap'; x: number; y: number; pts: number[]; by: number } // chain from (x, y) through pts (x0, y0, x1, y1...)
  | { t: 'voidEat'; hole: number; x: number; y: number; n: number } // hole closed and swallowed n targets
  | { t: 'fogStage'; stage: number }
  | { t: 'letterWave' }
  | { t: 'matchOver'; winner: number | null };

export interface World {
  seed: number;
  tick: number;
  time: number;
  rng: Rng;
  players: Player[];
  copies: LetterCopy[];
  mobs: Mob[];
  bullets: Bullet[];
  voids: VoidHole[];
  fog: Fog;
  wave: LetterWave;
  events: SimEvent[];
  over: boolean;
  winner: number | null;
  nextId: number;
  mobsEnabled: boolean;
}
