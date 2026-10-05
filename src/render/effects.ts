/** Ink effects: hit sparks, splats, shield waves, switch puffs, CAPITAL bursts, pickup rings. */
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { activeForm } from '../sim/combat';
import type { SimEvent, World } from '../sim/types';
import type { GameRenderer } from './renderer';
import { splatCanvas } from './paper';

const INK = 0x1b1a19;

interface Particle {
  s: Sprite;
  vx: number;
  vy: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
  a0: number;
  drag: number;
}

interface Ring {
  x: number;
  y: number;
  follow: number | null; // player id to follow
  r0: number;
  grow: number;
  t: number;
  life: number;
  width: number;
  alpha: number;
  color: number;
  // Arc (degrees); full circle when width >= 360.
  facing: number;
  span: number;
}

export class Effects {
  private layer = new Container();
  private rings = new Graphics();
  private particles: Particle[] = [];
  private pool: Sprite[] = [];
  private ringList: Ring[] = [];
  private splatTex: Texture[];
  private rippleT = new Map<number, number>();

  constructor(private r: GameRenderer) {
    r.fx.addChild(this.layer, this.rings);
    this.splatTex = [5, 9, 13].map((seed) => Texture.from(splatCanvas(96, seed)));
  }

  private sprite(tex: Texture): Sprite {
    const s = this.pool.pop() ?? new Sprite();
    s.texture = tex;
    s.anchor.set(0.5);
    s.visible = true;
    s.rotation = 0;
    if (!s.parent) this.layer.addChild(s);
    return s;
  }

  private particle(tex: Texture, x: number, y: number, o: Partial<Omit<Particle, 's'>> & { tint?: number; rot?: number }): void {
    if (this.particles.length > 600) return;
    const s = this.sprite(tex);
    s.position.set(x, y);
    s.tint = o.tint ?? INK;
    s.rotation = o.rot ?? 0;
    const p: Particle = { s, vx: o.vx ?? 0, vy: o.vy ?? 0, life: o.life ?? 0.4, max: o.life ?? 0.4, s0: o.s0 ?? 0.3, s1: o.s1 ?? 0.1, a0: o.a0 ?? 1, drag: o.drag ?? 4 };
    s.scale.set(p.s0);
    s.alpha = p.a0;
    this.particles.push(p);
  }

  private droplets(x: number, y: number, n: number, speed: number, size: number, life = 0.45): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particle(this.r.textureDot, x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), s0: size * (0.6 + Math.random() * 0.6), s1: 0.02, drag: 5 });
    }
  }

  ring(x: number, y: number, o: Partial<Ring>): void {
    if (this.ringList.length > 250) return;
    // Following rings use x/y as an offset from the player (0 unless given).
    if (o.follow != null) {
      x = 0;
      y = 0;
    }
    this.ringList.push({ x, y, follow: null, r0: 10, grow: 120, t: 0, life: 0.5, width: 3, alpha: 0.8, color: INK, facing: 0, span: 360, ...o });
  }

  splat(x: number, y: number, size: number, life = 2.5): void {
    const tex = this.splatTex[(Math.random() * this.splatTex.length) | 0];
    this.particle(tex, x, y, { life, s0: size * 0.6, s1: size, a0: 0.85, rot: Math.random() * Math.PI * 2, drag: 0 });
  }

  onEvents(events: SimEvent[], w: World): void {
    let shots = 0;
    for (const e of events) {
      switch (e.t) {
        case 'hit':
          this.droplets(e.x, e.y, e.target === 'player' ? 5 : 3, 160, 0.18, 0.3);
          break;
        case 'mobDeath':
          this.splat(e.x, e.y, 0.45, 1.6);
          this.droplets(e.x, e.y, 6, 220, 0.22);
          break;
        case 'playerDeath':
          this.splat(e.x, e.y, 1.6, 6);
          this.droplets(e.x, e.y, 26, 420, 0.4, 0.8);
          this.ring(e.x, e.y, { r0: 20, grow: 420, life: 0.7, width: 6 });
          break;
        case 'pickup':
          this.ring(e.x, e.y, { r0: 14, grow: 140, life: 0.45, width: 4, color: 0xd99a1e, alpha: 0.9 });
          break;
        case 'switch': {
          const p = w.players[e.id];
          this.droplets(p.x, p.y, 8, 200, 0.2, 0.3);
          this.ring(p.x, p.y, { follow: p.id, r0: 18, grow: 90, life: 0.25, width: 3, alpha: 0.6 });
          break;
        }
        case 'bold': {
          const p = w.players[e.id];
          this.ring(p.x, p.y, { follow: p.id, r0: 24, grow: 260, life: 0.9, width: 12 });
          this.droplets(p.x, p.y, 20, 360, 0.35, 0.6);
          if (e.id === this.viewId) this.r.shake(8);
          break;
        }
        case 'upgrade': {
          const p = w.players[e.id];
          this.ring(p.x, p.y, { follow: p.id, r0: 20, grow: 160, life: 0.8, width: 5, color: 0xd99a1e });
          this.ring(p.x, p.y, { follow: p.id, r0: 10, grow: 220, life: 1.0, width: 2, color: 0xd99a1e });
          break;
        }
        case 'capital': {
          const p = w.players[e.id];
          if (e.on) {
            // Bold inky transformation: thick ring, splatter, big droplets.
            this.ring(p.x, p.y, { r0: 30, grow: 520, life: 0.6, width: 14, alpha: 0.9 });
            this.ring(p.x, p.y, { r0: 20, grow: 300, life: 0.8, width: 4, alpha: 0.6 });
            this.splat(p.x, p.y, 1.3, 1.2);
            this.droplets(p.x, p.y, 30, 520, 0.35, 0.7);
            if (e.id === this.viewId) this.r.shake(12);
          } else this.droplets(p.x, p.y, 10, 160, 0.2, 0.4);
          break;
        }
        case 'shieldBlock': {
          const p = w.players[e.id];
          const form = activeForm(w, p);
          if (!form) break;
          for (const s of form.shields)
            this.ring(p.x, p.y, {
              follow: p.id,
              x: s.cx * form.size,
              y: s.cy * form.size,
              r0: s.r * form.size + 4,
              grow: 70,
              life: 0.35,
              width: 3,
              facing: s.facing,
              span: Math.min(360, s.width),
            });
          break;
        }
        case 'shot':
          if (shots++ < 12) {
            // Tiny muzzle blot at the shooter.
            const p = w.players[e.owner];
            if (p && Math.random() < 0.35) this.droplets(p.x, p.y, 1, 60, 0.12, 0.15);
          }
          break;
      }
    }
  }

  viewId = 0;

  update(w: World, dt: number, alpha: number): void {
    // Continuous little waves from shield letters' curvatures.
    for (const p of w.players) {
      if (!p.alive) continue;
      const form = activeForm(w, p);
      if (!form || !form.shields.length) continue;
      let t = (this.rippleT.get(p.id) ?? 0) - dt;
      if (t <= 0) {
        t = form.capital ? 0.22 : 0.4;
        for (const s of form.shields)
          this.ring(0, 0, {
            follow: p.id,
            x: s.cx * form.size,
            y: s.cy * form.size,
            r0: s.r * form.size + 2,
            grow: form.capital ? 60 : 40,
            life: 0.7,
            width: form.capital ? 2.5 : 1.6,
            alpha: 0.55,
            facing: s.facing,
            span: Math.min(360, s.width),
          });
      }
      this.rippleT.set(p.id, t);
    }

    let j = 0;
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) {
        p.s.visible = false;
        this.pool.push(p.s);
        continue;
      }
      const k = 1 - p.life / p.max;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.scale.set(p.s0 + (p.s1 - p.s0) * k);
      p.s.alpha = p.a0 * (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
      this.particles[j++] = p;
    }
    this.particles.length = j;

    const g = this.rings.clear();
    let n = 0;
    for (const r of this.ringList) {
      r.t += dt;
      if (r.t >= r.life) continue;
      this.ringList[n++] = r;
      const k = r.t / r.life;
      let cx = r.x;
      let cy = r.y;
      if (r.follow !== null) {
        const p = w.players[r.follow];
        const pos = this.r.playerPos(p, alpha);
        cx = pos.x + r.x;
        cy = pos.y + r.y;
      }
      const rad = r.r0 + r.grow * (1 - (1 - k) * (1 - k));
      const a = r.alpha * (1 - k);
      if (r.span >= 360) g.circle(cx, cy, rad);
      else {
        const half = ((r.span / 2) * Math.PI) / 180;
        const mid = (r.facing * Math.PI) / 180;
        g.moveTo(cx + Math.cos(mid - half) * rad, cy + Math.sin(mid - half) * rad);
        g.arc(cx, cy, rad, mid - half, mid + half);
      }
      g.stroke({ width: Math.max(0.5, r.width * (1 - k * 0.6)), color: r.color, alpha: a });
    }
    this.ringList.length = n;
  }
}
