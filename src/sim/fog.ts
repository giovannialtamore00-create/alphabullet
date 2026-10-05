/** Closing fog: shrinks in stages toward a final circle at a random spot. */
import { FOG_STAGES, FOG_START_RADIUS, MAP_SIZE } from './config';
import { damagePlayer } from './combat';
import type { Rng } from './rng';
import type { Fog, World } from './types';

function pickTarget(f: Fog, rng: Rng, stage: number): void {
  const toR = FOG_STAGES[stage].radius;
  const maxOff = Math.max(0, Math.min(f.r, FOG_START_RADIUS) - toR);
  for (let i = 0; i < 30; i++) {
    const ang = rng.next() * Math.PI * 2;
    const off = Math.sqrt(rng.next()) * maxOff;
    const x = f.x + Math.cos(ang) * off;
    const y = f.y + Math.sin(ang) * off;
    // Keep most of the next circle on the map.
    const m = Math.min(toR * 0.6 + 300, MAP_SIZE / 2);
    if (x >= m && x <= MAP_SIZE - m && y >= m && y <= MAP_SIZE - m) {
      f.toX = x;
      f.toY = y;
      f.toR = toR;
      return;
    }
  }
  f.toX = Math.min(MAP_SIZE * 0.75, Math.max(MAP_SIZE * 0.25, f.x));
  f.toY = Math.min(MAP_SIZE * 0.75, Math.max(MAP_SIZE * 0.25, f.y));
  f.toR = toR;
}

export function createFog(rng: Rng): Fog {
  const c = MAP_SIZE / 2;
  const f: Fog = {
    stage: 0,
    phase: 'wait',
    timer: FOG_STAGES[0].wait,
    x: c,
    y: c,
    r: FOG_START_RADIUS,
    fromX: c,
    fromY: c,
    fromR: FOG_START_RADIUS,
    toX: c,
    toY: c,
    toR: FOG_START_RADIUS,
    dps: FOG_STAGES[0].dps,
  };
  pickTarget(f, rng, 0);
  return f;
}

export function insideFog(f: Fog, x: number, y: number): boolean {
  return Math.hypot(x - f.x, y - f.y) > f.r;
}

export function updateFog(w: World, dt: number): void {
  const f = w.fog;
  if (f.phase !== 'done') {
    f.timer -= dt;
    if (f.phase === 'wait' && f.timer <= 0) {
      f.phase = 'shrink';
      f.timer = FOG_STAGES[f.stage].shrink;
      f.fromX = f.x;
      f.fromY = f.y;
      f.fromR = f.r;
    } else if (f.phase === 'shrink') {
      const dur = FOG_STAGES[f.stage].shrink;
      const k = Math.min(1, Math.max(0, 1 - f.timer / dur));
      f.x = f.fromX + (f.toX - f.fromX) * k;
      f.y = f.fromY + (f.toY - f.fromY) * k;
      f.r = f.fromR + (f.toR - f.fromR) * k;
      if (f.timer <= 0) {
        f.stage++;
        w.events.push({ t: 'fogStage', stage: f.stage });
        if (f.stage < FOG_STAGES.length) {
          f.phase = 'wait';
          f.timer = FOG_STAGES[f.stage].wait;
          f.dps = FOG_STAGES[f.stage].dps;
          pickTarget(f, w.rng, f.stage);
        } else {
          f.phase = 'done';
          f.timer = 0;
          f.dps = FOG_STAGES[FOG_STAGES.length - 1].dps;
        }
      }
    }
  }
  for (const p of w.players) {
    if (!p.alive) continue;
    p.inFog = insideFog(f, p.x, p.y);
    if (p.inFog) damagePlayer(w, p, f.dps * dt, f.x, f.y, null, false);
  }
}
