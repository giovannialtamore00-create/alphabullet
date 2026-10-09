import { describe, expect, it } from 'vitest';
import { SnapshotBuffer } from '../../src/net/interp';

const TICK_MS = 1000 / 30;
const FRAME_MS = 1000 / 60;

/** Seeded RNG so the run is repeatable. */
function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/**
 * Host sends snapshots on 2 of every 3 ticks; delivery is ordered with lag, jitter and loss spikes.
 * A remote entity moves 5 px per tick. Returns arrival times per snapshot tick (capped at 10 s).
 */
function arrivals(lag: number, jitter: number, lossPct: number, seed = 1) {
  const r = rng(seed);
  const out: { k: number; at: number }[] = [];
  let last = 0;
  for (let k = 1; k <= 300; k++) {
    if (k % 3 === 0) continue;
    let at = k * TICK_MS + lag + r() * jitter;
    if (r() * 100 < lossPct) at += 250;
    last = Math.max(last, at);
    out.push({ k, at: last });
  }
  return out;
}

/** Old client: blend prev -> newest over a fixed 50 ms after each arrival. */
function oldDisplay(msgs: { k: number; at: number }[]) {
  let prev = 0, target = 0, lastAt = 0, i = 0;
  const xs: number[] = [];
  for (let now = 0; now < 10000; now += FRAME_MS) {
    while (i < msgs.length && msgs[i].at <= now) {
      prev = target;
      target = msgs[i].k * 5;
      lastAt = msgs[i].at;
      i++;
    }
    xs.push(prev + (target - prev) * Math.min(1, (now - lastAt) / 50));
  }
  return xs;
}

/** New client: snapshot buffer, blend by tick. */
function newDisplay(msgs: { k: number; at: number }[]) {
  const buf = new SnapshotBuffer<{ k: number }>();
  let prev = 0, target = 0, i = 0;
  const xs: number[] = [];
  for (let now = 0; now < 10000; now += FRAME_MS) {
    while (i < msgs.length && msgs[i].at <= now) buf.push({ k: msgs[i++].k }, now);
    const { apply, alpha } = buf.update(now);
    for (const s of apply) {
      prev = target;
      target = s.k * 5;
    }
    xs.push(prev + (target - prev) * alpha);
  }
  return xs;
}

/** Frames (after 1 s warm-up, while the entity is still moving) where it froze or jumped. */
function stutter(xs: number[]) {
  let freezes = 0, jumps = 0, n = 0;
  for (let f = 61; f < 560; f++) {
    const d = xs[f] - xs[f - 1];
    n++;
    if (d < 0.01) freezes++;
    if (d > 5) jumps++; // normal is 2.5 px per frame
  }
  return { freezePct: Math.round((freezes / n) * 100), jumps, bad: freezes + jumps };
}

describe('snapshot interpolation', () => {
  const cases = [
    { name: 'good connection (30 ms, no jitter)', lag: 30, jitter: 0, loss: 0 },
    { name: 'typical (60 ms, 40 ms jitter)', lag: 60, jitter: 40, loss: 0 },
    { name: 'bad (80 ms, 60 ms jitter, 2% loss)', lag: 80, jitter: 60, loss: 2 },
  ];
  for (const c of cases) {
    it(`stutters less than before: ${c.name}`, () => {
      const msgs = arrivals(c.lag, c.jitter, c.loss);
      const before = stutter(oldDisplay(msgs));
      const after = stutter(newDisplay(msgs));
      console.log(`${c.name}: bad frames before ${before.bad} (freeze ${before.freezePct}%, jumps ${before.jumps}) | after ${after.bad} (freeze ${after.freezePct}%, jumps ${after.jumps}) of 499`);
      expect(after.bad).toBeLessThan(before.bad);
      if (c.loss === 0) expect(after.bad).toBeLessThanOrEqual(10);
    });
  }

  it('ignores duplicate and stale snapshots and keeps tick order', () => {
    const buf = new SnapshotBuffer<{ k: number }>();
    buf.push({ k: 5 }, 0);
    buf.push({ k: 7 }, 10);
    buf.push({ k: 4 }, 10); // late, older than the newest: still slots in before 5
    buf.push({ k: 7 }, 20); // duplicate
    const ticks: number[] = [];
    for (let now = 0; now < 1000; now += FRAME_MS) ticks.push(...buf.update(now).apply.map((s) => s.k));
    expect(ticks).toEqual([4, 5, 7]);
    buf.push({ k: 6 }, 1000); // already passed
    expect(buf.update(1000).apply).toEqual([]);
  });

  it('resyncs after a long stall (hidden host tab)', () => {
    const buf = new SnapshotBuffer<{ k: number }>();
    for (let k = 1; k <= 30; k++) buf.push({ k }, k * TICK_MS + 50);
    buf.update(30 * TICK_MS + 50);
    // Host was frozen for 5 s, then resumes at tick 31.
    const t = 30 * TICK_MS + 5050;
    buf.push({ k: 31 }, t);
    buf.push({ k: 32 }, t + TICK_MS);
    const { apply } = buf.update(t + TICK_MS * 5);
    expect(apply.map((s) => s.k)).toContain(31);
  });
});
