/**
 * Client-side snapshot buffer. Remote players and mobs are shown a few ticks in the past so there
 * is (almost) always a newer snapshot to blend towards, even with uneven or late packets.
 * Blending is by host tick number, not by wall-clock guesses.
 */
import { TICK_RATE } from '../sim/config';

/** How far behind the estimated host clock we display, in ticks (4 = ~133 ms). */
export const INTERP_DELAY_TICKS = 4;
/** If the clock estimate is off by more than this many ticks (tab was hidden, host stalled), resync. */
const RESYNC_TICKS = 15;
const TICK_MS = 1000 / TICK_RATE;

export class SnapshotBuffer<S extends { k: number }> {
  private queue: S[] = [];
  private offset = 0;
  private synced = false;
  private from = 0;
  private cur = -1;

  /** Store a snapshot that just arrived and refine the host clock estimate. */
  push(s: S, nowMs: number): void {
    if (s.k <= this.cur || this.queue.some((q) => q.k === s.k)) return;
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].k > s.k) i--;
    this.queue.splice(i, 0, s);
    const sample = s.k - nowMs / TICK_MS;
    if (!this.synced || Math.abs(sample - this.offset) > RESYNC_TICKS) {
      this.offset = sample;
      this.synced = true;
    } else this.offset += (sample - this.offset) * 0.05;
  }

  /** Host tick currently being displayed (fractional). */
  renderTick(nowMs: number): number {
    return nowMs / TICK_MS + this.offset - INTERP_DELAY_TICKS;
  }

  /** Snapshots due to be applied this frame (in order) and the blend factor towards the newest applied one. */
  update(nowMs: number): { apply: S[]; alpha: number } {
    const t = this.renderTick(nowMs);
    const apply: S[] = [];
    // Apply the next snapshot once we have reached the current target, so we blend from it to the next.
    while (this.queue.length && (this.cur < 0 || t >= this.cur)) {
      const s = this.queue.shift()!;
      this.from = this.cur < 0 ? s.k : this.cur;
      this.cur = s.k;
      apply.push(s);
    }
    const span = this.cur - this.from;
    const alpha = span > 0 ? Math.min(1, Math.max(0, (t - this.from) / span)) : 1;
    return { apply, alpha };
  }
}
