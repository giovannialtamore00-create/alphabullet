/** Uniform grid for broad-phase collision queries. Rebuilt every tick. */
export class SpatialHash<T extends { x: number; y: number }> {
  private cells = new Map<number, T[]>();
  constructor(private cell: number) {}
  private key(cx: number, cy: number): number {
    return (cx + 512) * 4096 + (cy + 512);
  }
  clear(): void {
    this.cells.clear();
  }
  insert(e: T): void {
    const k = this.key(Math.floor(e.x / this.cell), Math.floor(e.y / this.cell));
    const list = this.cells.get(k);
    if (list) list.push(e);
    else this.cells.set(k, [e]);
  }
  /** All entries in cells overlapping the box around (x, y) with half-size r. */
  query(x: number, y: number, r: number, out: T[] = []): T[] {
    out.length = 0;
    const x0 = Math.floor((x - r) / this.cell);
    const x1 = Math.floor((x + r) / this.cell);
    const y0 = Math.floor((y - r) / this.cell);
    const y1 = Math.floor((y + r) / this.cell);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const list = this.cells.get(this.key(cx, cy));
        if (list) for (const e of list) out.push(e);
      }
    return out;
  }
}
