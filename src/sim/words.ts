/** Word powers: type a word whose letters you all own to trigger its effect. Pure: no DOM. */
import { BOMB, BOUNCE, CHUNKY, DASH, DISARM, ERASE, EXILE, FLIP, JET, FREEZE, LIFE, MAGNET, MAP_SIZE, MAX_PASSIVES, PIERCE, PUSH, PVP_DAMAGE_MUL, SPEED, SPIN, SPLASH, VOID, WORD_IMMUNITY, XP, XRAY, ZAP } from './config';
import { creditXp, damageMob, damagePlayer } from './combat';
import type { Player, TimedFx, World } from './types';

type Effect = (w: World, p: Player) => void;

/** Effect that just starts a timer in Player.fx; the sim reads the timer where it matters. */
const timed = (k: TimedFx, duration: number): Effect => (_w, p) => {
  p.fx[k] = duration;
};

/** Blast around the player hitting every mob and enemy in range. */
export function bombBlast(w: World, p: Player): void {
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
}

const EFFECTS = {
  /** Bullets pass through enemies for a while. */
  pierce: timed('pierce', PIERCE.duration),
  /** Continuous: blasts now, then again every BOMB.every seconds until switched off (see step in world.ts). */
  bomb: (w, p) => {
    p.fx.bomb = BOMB.every;
    p.bombT = BOMB.every;
    bombBlast(w, p);
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
  /** Bigger body and bullets. */
  chunky: timed('chunky', CHUNKY.duration),
  /** Fast spin, faster fire and recoil drift (see fire() in world.ts). */
  jet: timed('jet', JET.duration),
  /** Every other player in the caster's view is teleported inside (or up to EXILE.fogReach into the fog around) the safe circle: the closer they were, the farther they land. */
  exile: (w, p) => {
    const diag = Math.hypot(EXILE.halfW, EXILE.halfH);
    const reach = w.fog.r * (1 + EXILE.fogReach);
    const maxD = Math.max(EXILE.minDist, Math.hypot(p.x - w.fog.x, p.y - w.fog.y) + reach);
    for (const q of w.players) {
      if (q === p || !q.alive || Math.abs(q.x - p.x) > EXILE.halfW || Math.abs(q.y - p.y) > EXILE.halfH) continue;
      const closeness = 1 - Math.min(1, Math.hypot(q.x - p.x, q.y - p.y) / diag);
      const target = EXILE.minDist + (maxD - EXILE.minDist) * closeness;
      // Of 40 random spots in the reach circle, take the one whose distance from the caster is nearest the target.
      let best = { x: w.fog.x, y: w.fog.y };
      let bestErr = Infinity;
      for (let i = 0; i < 40; i++) {
        const ang = w.rng.next() * Math.PI * 2;
        const rad = Math.sqrt(w.rng.next()) * reach;
        const x = Math.min(MAP_SIZE - 20, Math.max(20, w.fog.x + Math.cos(ang) * rad));
        const y = Math.min(MAP_SIZE - 20, Math.max(20, w.fog.y + Math.sin(ang) * rad));
        const err = Math.abs(Math.hypot(x - p.x, y - p.y) - target);
        if (err < bestErr) {
          bestErr = err;
          best = { x, y };
        }
      }
      q.x = best.x;
      q.y = best.y;
    }
  },
  /** The X letter (switched to in applyInput) fires piercing lasers. */
  xray: timed('xray', XRAY.duration),
} satisfies Record<string, Effect>;

export interface WordDef {
  word: string; // capital letters
  cooldown: number; // seconds
  effect: keyof typeof EFFECTS;
  /** Passive: typing switches it on until pushed out by newer passives (no timer, no cooldown). */
  passive?: boolean;
}

/** Add new words here. A new kind of effect also needs a function in EFFECTS. */
export const WORDS: WordDef[] = [
  { word: 'PIERCE', cooldown: PIERCE.cooldown, effect: 'pierce', passive: true },
  { word: 'BOMB', cooldown: 0, effect: 'bomb', passive: true },
  { word: 'DASH', cooldown: DASH.cooldown, effect: 'dash' },
  { word: 'PUSH', cooldown: PUSH.cooldown, effect: 'push' },
  { word: 'BOUNCE', cooldown: BOUNCE.cooldown, effect: 'bounce', passive: true },
  { word: 'FREEZE', cooldown: FREEZE.cooldown, effect: 'freeze', passive: true },
  { word: 'ERASE', cooldown: ERASE.cooldown, effect: 'erase' },
  { word: 'VOID', cooldown: VOID.cooldown, effect: 'void' },
  { word: 'SQUIRT', cooldown: SPLASH.cooldown, effect: 'splash' },
  { word: 'DISARM', cooldown: DISARM.cooldown, effect: 'disarm', passive: true },
  { word: 'QUICK', cooldown: SPEED.cooldown, effect: 'speed', passive: true },
  { word: 'LIFE', cooldown: LIFE.cooldown, effect: 'life' },
  { word: 'ZAP', cooldown: ZAP.cooldown, effect: 'zap', passive: true },
  { word: 'WHIRL', cooldown: SPIN.cooldown, effect: 'spin', passive: true },
  { word: 'FLIP', cooldown: FLIP.cooldown, effect: 'flip', passive: true },
  { word: 'MAGNET', cooldown: MAGNET.cooldown, effect: 'magnet', passive: true },
  { word: 'JETPACK', cooldown: JET.cooldown, effect: 'jet' },
  { word: 'EXILE', cooldown: EXILE.cooldown, effect: 'exile' },
  { word: 'CHUNKY', cooldown: CHUNKY.cooldown, effect: 'chunky', passive: true },
  { word: 'XRAY', cooldown: XRAY.cooldown, effect: 'xray' },
];

/** Fx timer length that a passive keeps refilling (SPIN needs the full cycle to keep its rotation smooth). */
const PASSIVE_LEN: Partial<Record<TimedFx, number>> = { pierce: PIERCE.duration, bounce: BOUNCE.duration, freeze: FREEZE.duration, disarm: DISARM.duration, speed: SPEED.duration, zap: ZAP.duration, spin: SPIN.duration, flip: FLIP.duration, magnet: MAGNET.duration, chunky: CHUNKY.duration, bomb: BOMB.every };

/** Non-passive words that run for a while: the fx timer that says they are on. */
const RUNNING_FX: Record<string, TimedFx> = { ERASE: 'erase', JETPACK: 'jet', XRAY: 'xray' };

/** Keep the fx timer of every owned passive full; passives whose word is no longer owned are off. Called each tick. */
export function refreshPassives(w: World, p: Player): void {
  for (const word of p.passives) {
    const k = WORDS.find((d) => d.word === word)!.effect as TimedFx;
    if (ownsWord(w, p, word) && p.alive) {
      if (p.fx[k] <= 0) p.fx[k] = PASSIVE_LEN[k]!;
    } else p.fx[k] = 0;
  }
}

/** True if the player owns at least one copy of every letter in the word. */
export function ownsWord(w: World, p: Player, word: string): boolean {
  const have = new Set(p.letters.map((id) => w.copies[id].letter));
  return [...word].every((ch) => have.has(ch));
}

/** Trigger `word` for `p` if it exists, all letters are owned and it is off cooldown. */
export function useWord(w: World, p: Player, word: string): boolean {
  const def = WORDS.find((d) => d.word === word);
  if (!def || !p.alive || !ownsWord(w, p, word)) return false;
  // Typing a power that is already running switches it off (no cooldown change).
  const running = RUNNING_FX[word];
  if (def.passive ? p.passives.includes(word) : running && p.fx[running] > 0) {
    if (def.passive) p.passives.splice(p.passives.indexOf(word), 1);
    p.fx[(def.passive ? def.effect : running) as TimedFx] = 0;
    return true;
  }
  if ((p.wordCd[word] ?? 0) > 0) return false;
  if (def.passive) {
    p.passives.push(word);
    if (p.passives.length > MAX_PASSIVES) {
      const old = WORDS.find((d) => d.word === p.passives.shift())!;
      p.fx[old.effect as TimedFx] = 0;
    }
    EFFECTS[def.effect](w, p);
    w.events.push({ t: 'word', id: p.id, word, x: p.x, y: p.y, fromX: p.x, fromY: p.y });
    return true;
  }
  const fromX = p.x;
  const fromY = p.y;
  EFFECTS[def.effect](w, p);
  p.wordCd[word] = def.cooldown;
  p.spawnProt = Math.max(p.spawnProt, WORD_IMMUNITY);
  w.events.push({ t: 'word', id: p.id, word, x: p.x, y: p.y, fromX, fromY });
  return true;
}

/** If the typed letters end with a known word, return it. Used by the keyboard. */
export function matchWord(typed: string): string | null {
  return WORDS.find((d) => typed.endsWith(d.word))?.word ?? null;
}
