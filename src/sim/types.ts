import type { Rng } from './rng';
import type { MobTierName } from './glyphs';

/** One tick of input. Humans and bots produce exactly this; the sim cannot tell them apart. */
export interface PlayerInput {
  mx: number; // -1, 0, 1
  my: number; // -1, 0, 1
  switchTo: string | null; // capital letter key, e.g. 'A'
  capital: boolean; // Shift pressed this tick
}
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
  fog: Fog;
  wave: LetterWave;
  events: SimEvent[];
  over: boolean;
  winner: number | null;
  nextId: number;
  mobsEnabled: boolean;
}
