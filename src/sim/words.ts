/** Word powers: type a word whose letters you all own to trigger its effect. Pure: no DOM. */
import { BOMB, DASH, MAP_SIZE, PIERCE, PVP_DAMAGE_MUL, XP } from './config';
import { creditXp, damageMob, damagePlayer } from './combat';
import type { Player, World } from './types';

type Effect = (w: World, p: Player) => void;

const EFFECTS = {
  /** Bullets pass through enemies for a while. */
  pierce: (_w, p) => {
    p.pierceTimer = PIERCE.duration;
  },
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
