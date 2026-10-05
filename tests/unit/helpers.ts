import { createWorld, step } from '../../src/sim/world';
import { NO_INPUT, type PlayerInput, type World } from '../../src/sim/types';

export function testWorld(seed = 1, players = 8, mobs = false): World {
  return createWorld(
    seed,
    Array.from({ length: players }, (_, i) => ({ name: `P${i}`, isBot: i > 0 })),
    { mobs },
  );
}

/** Step at most `ticks` (hard cap 500) with a fixed input per player. */
export function run(w: World, ticks: number, inputs: Record<number, PlayerInput> = {}): void {
  const n = Math.min(ticks, 500);
  for (let i = 0; i < n; i++) step(w, inputs);
}

/** Move everyone far apart and clear map letters so tests are isolated. */
export function isolate(w: World): void {
  w.players.forEach((p, i) => {
    p.x = 500 + (i % 4) * 1800;
    p.y = 500 + Math.floor(i / 4) * 3000;
  });
  for (const c of w.copies) if (c.state === 'ground') c.state = 'pool';
}

export const idle = NO_INPUT;
