/** Word powers: type a word whose letters you all own to trigger its effect. Pure: no DOM. */
import { BOMB, BOUNCE, DASH, DISARM, ERASE, FLIP, FREEZE, LIFE, MAGNET, MAP_SIZE, PIERCE, PUSH, PVP_DAMAGE_MUL, SPEED, SPIN, SPLASH, VOID, XP, ZAP } from './config';
import { creditXp, damageMob, damagePlayer } from './combat';
import type { Player, TimedFx, World } from './types';

type Effect = (w: World, p: Player) => void;

/** Effect that just starts a timer in Player.fx; the sim reads the timer where it matters. */
const timed = (k: TimedFx, duration: number): Effect => (_w, p) => {
  p.fx[k] = duration;
};

const EFFECTS = {
  /** Bullets pass through enemies for a while. */
  pierce: timed('pierce', PIERCE.duration),
  /** Blast around the player hitting every mob and enemy in range. */
  bomb: (w, p) => {
    const r2 = BOMB.radius * BOMB.radius;
    for (const m of w.mobs) {
      if (m.hp <= 0 || (m.x - p.x) ** 2 + (m.y - p.y) ** 2 > r2) continue;
      const dealt = damageMob(w, m, BOMB.dmg, p.id, p.active);
      p.damageDealt += dealt;
      creditXp(w, p.id, p.active, dealt * XP.perDamage);
    }
    for (const q of w.players) {
      if (q === p || !q.alive || (q.x - p.x) ** 2 + (q.y - p.y) ** 2 > r2) continue;
      const dealt = damagePlayer(w, q, BOMB.dmg * PVP_DAMAGE_MUL, p.x, p.y, p.id);
      p.damageDealt += dealt;
      creditXp(w, p.id, p.active, dealt * XP.perDamage);
    }
  },
  /** Teleport forward along the last movement direction, staying on the map. */
  dash: (_w, p) => {
    p.x = Math.min(MAP_SIZE - 20, Math.max(20, p.x + p.faceX * DASH.dist));
    p.y = Math.min(MAP_SIZE - 20, Math.max(20, p.y + p.faceY * DASH.dist));
  },
  /** Shove every mob and enemy around the player straight away from it. */
  push: (w, p) => {
    const r2 = PUSH.radius * PUSH.radius;
    const shove = (t: { x: number; y: number }) => {
      const dx = t.x - p.x;
      const dy = t.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > r2) return;
      const d = Math.sqrt(d2);
      const ux = d ? dx / d : 1; // exactly on top: push right
      const uy = d ? dy / d : 0;
      t.x = Math.min(MAP_SIZE - 20, Math.max(20, t.x + ux * PUSH.dist));
      t.y = Math.min(MAP_SIZE - 20, Math.max(20, t.y + uy * PUSH.dist));
    };
    for (const m of w.mobs) if (m.hp > 0) shove(m);
    for (const q of w.players) if (q !== p && q.alive) shove(q);
  },
  /** Bullets bounce off what they hit and off the map edge. */
  bounce: timed('bounce', BOUNCE.duration),
  /** Bullets slow what they hit (stacking up to FREEZE.max). */
  freeze: timed('freeze', FREEZE.duration),
  /** Enemy bullets entering a circle around the player are erased. */
  erase: timed('erase', ERASE.duration),
  /** Black hole at the player's position (see updateVoids in world.ts). */
  void: (w, p) => {
    w.voids.push({ id: w.nextId++, owner: p.id, x: p.x, y: p.y, t: 0 });
  },
  /** Ink over every other player's screen. */
  splash: (w, p) => {
    for (const q of w.players) if (q !== p && q.alive) q.splashT = SPLASH.duration;
  },
  /** Bullets that hit a player stop its weapon from firing for DISARM.lock seconds. */
  disarm: timed('disarm', DISARM.duration),
  /** Faster movement. */
  speed: timed('speed', SPEED.duration),
  /** Refill the active letter's HP. */
  life: (_w, p) => {
    p.hp = p.maxHp;
  },
  /** Bullet hits chain to nearby targets. */
  zap: timed('zap', ZAP.duration),
  /** The letter spins, spraying its pattern all around. */
  spin: timed('spin', SPIN.duration),
  /** The glyph is mirrored top-to-bottom, so its bullets go the other way. */
  flip: timed('flip', FLIP.duration),
  /** Nearby letters on the ground slide toward the player. */
  magnet: timed('magnet', MAGNET.duration),
} satisfies Record<string, Effect>;

export interface WordDef {
  word: string; // capital letters
  cooldown: number; // seconds
  effect: keyof typeof EFFECTS;
}

/** Add new words here. A new kind of effect also needs a function in EFFECTS. */
export const WORDS: WordDef[] = [
  { word: 'PIERCE', cooldown: PIERCE.cooldown, effect: 'pierce' },
  { word: 'BOMB', cooldown: BOMB.cooldown, effect: 'bomb' },
  { word: 'DASH', cooldown: DASH.cooldown, effect: 'dash' },
  { word: 'PUSH', cooldown: PUSH.cooldown, effect: 'push' },
  { word: 'BOUNCE', cooldown: BOUNCE.cooldown, effect: 'bounce' },
  { word: 'FREEZE', cooldown: FREEZE.cooldown, effect: 'freeze' },
  { word: 'ERASE', cooldown: ERASE.cooldown, effect: 'erase' },
  { word: 'VOID', cooldown: VOID.cooldown, effect: 'void' },
  { word: 'SQUIRT', cooldown: SPLASH.cooldown, effect: 'splash' },
  { word: 'DISARM', cooldown: DISARM.cooldown, effect: 'disarm' },
  { word: 'QUICK', cooldown: SPEED.cooldown, effect: 'speed' },
  { word: 'LIFE', cooldown: LIFE.cooldown, effect: 'life' },
  { word: 'ZAP', cooldown: ZAP.cooldown, effect: 'zap' },
  { word: 'WHIRL', cooldown: SPIN.cooldown, effect: 'spin' },
  { word: 'FLIP', cooldown: FLIP.cooldown, effect: 'flip' },
  { word: 'MAGNET', cooldown: MAGNET.cooldown, effect: 'magnet' },
];

/** True if the player owns at least one copy of every letter in the word. */
export function ownsWord(w: World, p: Player, word: string): boolean {
  const have = new Set(p.letters.map((id) => w.copies[id].letter));
  return [...word].every((ch) => have.has(ch));
}

/** Trigger `word` for `p` if it exists, all letters are owned and it is off cooldown. */
export function useWord(w: World, p: Player, word: string): boolean {
  const def = WORDS.find((d) => d.word === word);
  if (!def || !p.alive || (p.wordCd[word] ?? 0) > 0 || !ownsWord(w, p, word)) return false;
  const fromX = p.x;
  const fromY = p.y;
  EFFECTS[def.effect](w, p);
  p.wordCd[word] = def.cooldown;
  w.events.push({ t: 'word', id: p.id, word, x: p.x, y: p.y, fromX, fromY });
  return true;
}

/** If the typed letters end with a known word, return it. Used by the keyboard. */
export function matchWord(typed: string): string | null {
  return WORDS.find((d) => typed.endsWith(d.word))?.word ?? null;
}
