/** PixiJS renderer: paper floor, ink glyphs, camera, fog, minimap. Reads the world; never mutates it. */
import { Application, Container, Graphics, Sprite, Text, Texture, TilingSprite } from 'pixi.js';
import { MAP_SIZE } from '../sim/config';
import { activeCopy, activeForm } from '../sim/combat';
import { getForm } from '../sim/glyphDerive';
import { MOBS } from '../sim/glyphs';
import type { Bullet, Mob, Player, World } from '../sim/types';
import { glyphCanvas } from './glyphCanvas';
import { inkDotCanvas, paperCanvas, softDotCanvas } from './paper';

const INK = 0x1b1a19;
const GLOW = 0xf2b632;
const GLOW_UP = 0xe0563b;

export interface RenderOpts {
  localId: number;
  viewId: number; // player the camera follows (spectating when local is dead)
  minimap: boolean;
  debug: { hitboxes: boolean };
}

interface PlayerView {
  root: Container;
  glyph: Sprite;
  marker: Graphics;
  name: Text;
  bar: Graphics;
  key: string;
  flash: number;
}

export class GameRenderer {
  app = new Application();
  readonly world = new Container();
  private paper!: TilingSprite;
  private outside = new Graphics();
  private ground = new Container();
  private mobLayer = new Container();
  private bulletLayer = new Container();
  private playerLayer = new Container();
  /** Effects layer (filled by the effects module). */
  readonly fx = new Container();
  private fog = new Graphics();
  private debugG = new Graphics();
  private minimap = new Graphics();
  private tex = new Map<string, Texture>();
  private dotTex!: Texture;
  private glowTex!: Texture;
  private mobs = new Map<number, Sprite>();
  private bullets = new Map<number, Sprite>();
  private bulletPool: Sprite[] = [];
  private pickups = new Map<number, { root: Container; halo: Sprite; glyph: Sprite; key: string }>();
  private players = new Map<number, PlayerView>();
  private prevP = new Map<number, { x: number; y: number }>();
  private prevM = new Map<number, { x: number; y: number }>();
  private prevB = new Map<number, { x: number; y: number }>();
  private mobFlash = new Map<number, number>();
  camX = MAP_SIZE / 2;
  camY = MAP_SIZE / 2;
  zoom = 1;
  private shakeAmt = 0;
  private time = 0;
  private miniT = 0;

  async init(parent: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: window, background: '#f3eee2', antialias: true, autoDensity: true, resolution: Math.min(2, window.devicePixelRatio || 1) });
    parent.appendChild(this.app.canvas);
    this.paper = new TilingSprite({ texture: Texture.from(paperCanvas()), width: 100, height: 100 });
    this.dotTex = Texture.from(inkDotCanvas());
    this.glowTex = Texture.from(softDotCanvas());
    this.app.stage.addChild(this.paper, this.world, this.minimap);
    this.world.addChild(this.outside, this.ground, this.mobLayer, this.bulletLayer, this.playerLayer, this.fx, this.fog, this.debugG);
  }

  get textureDot(): Texture {
    return this.dotTex;
  }
  get textureGlow(): Texture {
    return this.glowTex;
  }

  /** Cached white glyph texture (drawn at 2x; sprites use scale 0.5). */
  letterTex(letter: string, capital: boolean): Texture {
    const key = letter + (capital ? '!' : '');
    let t = this.tex.get(key);
    if (!t) {
      const f = getForm(letter, capital);
      t = Texture.from(glyphCanvas(f.glyph.strokes, f.size, 2, '#ffffff', capital ? 0.13 : 0.11));
      this.tex.set(key, t);
    }
    return t;
  }

  mobTex(kind: string, size: number): Texture {
    const key = 'mob:' + kind;
    let t = this.tex.get(key);
    if (!t) {
      t = Texture.from(glyphCanvas(MOBS[kind].strokes, size, 2, '#ffffff', 0.12));
      this.tex.set(key, t);
    }
    return t;
  }

  shake(amount: number): void {
    this.shakeAmt = Math.min(18, this.shakeAmt + amount);
  }

  /** Remember positions before a sim step, for interpolation. */
  snapshotPrev(w: World): void {
    this.prevP.clear();
    this.prevM.clear();
    this.prevB.clear();
    for (const p of w.players) this.prevP.set(p.id, { x: p.x, y: p.y });
    for (const m of w.mobs) this.prevM.set(m.id, { x: m.x, y: m.y });
    for (const b of w.bullets) this.prevB.set(b.id, { x: b.x, y: b.y });
  }

  flashMob(id: number): void {
    this.mobFlash.set(id, 0.12);
  }
  flashPlayer(id: number): void {
    const v = this.players.get(id);
    if (v) v.flash = 0.15;
  }

  private lerp(prev: Map<number, { x: number; y: number }>, id: number, x: number, y: number, a: number) {
    const p = prev.get(id);
    if (!p || Math.abs(p.x - x) > 200 || Math.abs(p.y - y) > 200) return { x, y };
    return { x: p.x + (x - p.x) * a, y: p.y + (y - p.y) * a };
  }

  /** Online client: our predicted player and client-simulated bullets are drawn without interpolation. */
  noLerpId = -1;
  bulletLerp = true;

  playerPos(p: Player, a: number) {
    if (p.id === this.noLerpId) return { x: p.x, y: p.y };
    return this.lerp(this.prevP, p.id, p.x, p.y, a);
  }

  /** World -> screen transform helpers for effects/HUD. */
  toScreen(x: number, y: number) {
    return { x: (x - this.camX) * this.zoom + this.app.screen.width / 2, y: (y - this.camY) * this.zoom + this.app.screen.height / 2 };
  }

  render(w: World, alpha: number, dt: number, opts: RenderOpts): void {
    this.time += dt;
    const sw = this.app.screen.width;
    const sh = this.app.screen.height;
    this.zoom = Math.max(0.6, Math.min(1.4, Math.min(sw / 1600, sh / 900)));

    // Camera follows the viewed player.
    const view = w.players[opts.viewId] ?? w.players[0];
    const vp = this.playerPos(view, alpha);
    const k = Math.min(1, dt * 8);
    this.camX += (vp.x - this.camX) * k;
    this.camY += (vp.y - this.camY) * k;
    if (Math.hypot(vp.x - this.camX, vp.y - this.camY) > 1500) {
      this.camX = vp.x;
      this.camY = vp.y;
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 40);
    const sx = (Math.random() - 0.5) * this.shakeAmt;
    const sy = (Math.random() - 0.5) * this.shakeAmt;
    this.world.scale.set(this.zoom);
    this.world.position.set(sw / 2 - (this.camX + sx) * this.zoom, sh / 2 - (this.camY + sy) * this.zoom);

    // Paper scrolls with the camera.
    this.paper.width = sw;
    this.paper.height = sh;
    this.paper.tileScale.set(this.zoom);
    this.paper.tilePosition.set(this.world.position.x, this.world.position.y);

    const halfW = sw / 2 / this.zoom + 80;
    const halfH = sh / 2 / this.zoom + 80;
    const vx0 = this.camX - halfW, vx1 = this.camX + halfW, vy0 = this.camY - halfH, vy1 = this.camY + halfH;
    const inView = (x: number, y: number, m = 60) => x > vx0 - m && x < vx1 + m && y > vy0 - m && y < vy1 + m;

    this.drawOutside(vx0, vy0, vx1, vy1);
    this.syncPickups(w, inView);
    this.syncMobs(w, alpha, dt, inView);
    this.syncBullets(w, alpha, inView);
    this.syncPlayers(w, alpha, dt, opts);
    this.drawFog(w, vx0, vy0, vx1, vy1);
    this.drawDebug(w, alpha, opts);
    this.miniT -= dt;
    if (this.miniT <= 0) {
      this.miniT = 0.1;
      this.drawMinimap(w, opts);
    }
  }

  private drawOutside(x0: number, y0: number, x1: number, y1: number): void {
    const g = this.outside.clear();
    const S = MAP_SIZE;
    const shade = { color: 0x3a342c, alpha: 0.16 };
    if (x0 < 0) g.rect(x0, y0, -x0, y1 - y0).fill(shade);
    if (x1 > S) g.rect(S, y0, x1 - S, y1 - y0).fill(shade);
    if (y0 < 0) g.rect(Math.max(0, x0), y0, Math.min(S, x1) - Math.max(0, x0), -y0).fill(shade);
    if (y1 > S) g.rect(Math.max(0, x0), S, Math.min(S, x1) - Math.max(0, x0), y1 - S).fill(shade);
    // Soft ink border along the map edge.
    for (let i = 0; i < 4; i++) g.rect(-i * 6, -i * 6, S + i * 12, S + i * 12).stroke({ width: 4, color: INK, alpha: 0.12 - i * 0.025 });
  }

  private syncPickups(w: World, inView: (x: number, y: number, m?: number) => boolean): void {
    const seen = new Set<number>();
    for (const c of w.copies) {
      if (c.state !== 'ground' || !inView(c.x, c.y, 120)) continue;
      seen.add(c.id);
      const key = c.letter + (c.upgraded ? '!' : '');
      let v = this.pickups.get(c.id);
      if (!v || v.key !== key) {
        if (v) v.root.destroy({ children: true });
        const root = new Container();
        const halo = new Sprite(this.glowTex);
        halo.anchor.set(0.5);
        halo.tint = c.upgraded ? GLOW_UP : GLOW;
        const glyph = new Sprite(this.letterTex(c.letter, c.upgraded));
        glyph.anchor.set(0.5);
        glyph.tint = INK;
        root.addChild(halo, glyph);
        this.ground.addChild(root);
        v = { root, halo, glyph, key };
        this.pickups.set(c.id, v);
      }
      const pulse = Math.sin(this.time * 4 + c.id);
      v.root.position.set(c.x, c.y);
      v.halo.scale.set((c.upgraded ? 1.5 : 1.15) + pulse * 0.15);
      v.halo.alpha = (c.upgraded ? 0.75 : 0.55) + pulse * 0.2;
      v.glyph.scale.set(0.5 * (0.92 + pulse * 0.08));
    }
    for (const [id, v] of this.pickups)
      if (!seen.has(id)) {
        v.root.destroy({ children: true });
        this.pickups.delete(id);
      }
  }

  private syncMobs(w: World, a: number, dt: number, inView: (x: number, y: number, m?: number) => boolean): void {
    const seen = new Set<number>();
    for (const m of w.mobs) {
      const p = this.lerp(this.prevM, m.id, m.x, m.y, a);
      if (!inView(p.x, p.y)) continue;
      seen.add(m.id);
      let s = this.mobs.get(m.id);
      if (!s) {
        s = new Sprite(this.mobTex(m.kind, m.r * 2.2));
        s.anchor.set(0.5);
        s.scale.set(0.5);
        this.mobLayer.addChild(s);
        this.mobs.set(m.id, s);
      }
      s.position.set(p.x, p.y);
      const fl = this.mobFlash.get(m.id) ?? 0;
      s.tint = fl > 0 ? 0xb8402a : INK;
      if (fl > 0) this.mobFlash.set(m.id, fl - dt);
      s.rotation = Math.sin(this.time * 6 + m.id) * 0.08; // jittery scuttle
      s.alpha = 0.55 + 0.45 * (m.hp / m.maxHp);
      this.setMobScale(s, m, fl);
    }
    for (const [id, s] of this.mobs)
      if (!seen.has(id)) {
        s.destroy();
        this.mobs.delete(id);
        this.mobFlash.delete(id);
      }
  }

  private setMobScale(s: Sprite, _m: Mob, flash: number): void {
    s.scale.set(0.5 * (1 + Math.max(0, flash) * 1.2));
  }

  private syncBullets(w: World, a: number, inView: (x: number, y: number, m?: number) => boolean): void {
    const seen = new Set<number>();
    for (const b of w.bullets) {
      const p = this.bulletLerp ? this.lerp(this.prevB, b.id, b.x, b.y, a) : { x: b.x, y: b.y };
      if (!inView(p.x, p.y, 20)) continue;
      seen.add(b.id);
      let s = this.bullets.get(b.id);
      if (!s) {
        s = this.bulletPool.pop() ?? new Sprite(this.dotTex);
        s.anchor.set(0.5);
        s.tint = INK;
        s.visible = true;
        if (!s.parent) this.bulletLayer.addChild(s);
        this.bullets.set(b.id, s);
      }
      this.placeBullet(s, b, p.x, p.y);
    }
    for (const [id, s] of this.bullets)
      if (!seen.has(id)) {
        s.visible = false;
        this.bulletPool.push(s);
        this.bullets.delete(id);
      }
  }

  private placeBullet(s: Sprite, b: Bullet, x: number, y: number): void {
    s.position.set(x, y);
    const sc = (b.r * 2.3) / 32;
    // Slight stretch along travel direction reads as motion.
    s.rotation = Math.atan2(b.vy, b.vx);
    s.scale.set(sc * 1.35, sc * 0.85);
  }

  private syncPlayers(w: World, a: number, dt: number, opts: RenderOpts): void {
    for (const p of w.players) {
      let v = this.players.get(p.id);
      if (!v) {
        const root = new Container();
        const marker = new Graphics();
        const glyph = new Sprite(Texture.EMPTY);
        glyph.anchor.set(0.5);
        glyph.tint = INK;
        const name = new Text({ text: p.name, style: { fontFamily: 'Courier New, monospace', fontSize: 13, fill: INK, fontWeight: 'bold' } });
        name.anchor.set(0.5, 1);
        name.alpha = 0.75;
        const bar = new Graphics();
        root.addChild(marker, glyph, name, bar);
        this.playerLayer.addChild(root);
        v = { root, glyph, marker, name, bar, key: '', flash: 0 };
        this.players.set(p.id, v);
      }
      v.root.visible = p.alive;
      if (!p.alive) continue;
      const pos = this.playerPos(p, a);
      v.root.position.set(pos.x, pos.y);
      const c = activeCopy(w, p);
      const form = activeForm(w, p);
      if (!c || !form) continue;
      const cap = c.capitalTimer > 0;
      const key = c.letter + (cap ? '!' : '');
      if (key !== v.key) {
        v.glyph.texture = this.letterTex(c.letter, cap);
        v.key = key;
      }
      // Morph: quick squash-and-grow on switch / CAPITAL.
      const m = Math.min(1, p.morph / (cap ? 0.35 : 0.22));
      const pop = m < 1 ? 0.55 + 0.45 * m + Math.sin(m * Math.PI) * (cap ? 0.35 : 0.15) : 1;
      v.glyph.scale.set(0.5 * pop, 0.5 * (m < 1 ? 0.7 + 0.3 * m : 1) * pop);
      v.flash = Math.max(0, v.flash - dt);
      v.glyph.tint = v.flash > 0 ? 0xb8402a : INK;
      const r = form.radius;
      v.marker.clear();
      if (p.id === opts.localId) {
        v.marker.ellipse(0, r + 8, r * 0.95, 6).stroke({ width: 3, color: INK, alpha: 0.85 });
        v.marker.ellipse(0, r + 8, r * 0.95 + 5, 9).stroke({ width: 1.2, color: INK, alpha: 0.35 });
      }
      v.name.position.set(0, -r - 10);
      v.name.visible = p.id !== opts.localId;
      v.bar.clear();
      if (p.id !== opts.localId) {
        const bw = 40;
        v.bar.rect(-bw / 2, r + 6, bw, 4).stroke({ width: 1, color: INK, alpha: 0.6 });
        v.bar.rect(-bw / 2, r + 6, (bw * Math.max(0, p.hp)) / 100, 4).fill({ color: INK, alpha: 0.75 });
      }
    }
  }

  private drawFog(w: World, x0: number, y0: number, x1: number, y1: number): void {
    const f = w.fog;
    const g = this.fog.clear();
    const fx = f.x, fy = f.y, r = Math.max(0, f.r);
    // Farthest view corner from the fog center: if it is inside the circle, no fog is visible.
    const far = Math.hypot(Math.max(Math.abs(x0 - fx), Math.abs(x1 - fx)), Math.max(Math.abs(y0 - fy), Math.abs(y1 - fy)));
    if (far > r) {
      // A thick ring from r outward (no polygon holes, which break when the circle exceeds the view).
      const T = far - r + 60;
      g.circle(fx, fy, r + T / 2).stroke({ width: T, color: 0x5f5a54, alpha: 0.42 });
      // Smudged edge: soft concentric washes.
      for (let i = 0; i < 6; i++) g.circle(fx, fy, Math.max(1, r - 30 + i * 10)).stroke({ width: 12, color: 0x5f5a54, alpha: 0.06 });
      if (r > 1) g.circle(fx, fy, r).stroke({ width: 2, color: INK, alpha: 0.25 });
    }
    // Next safe zone: dashed ink circle.
    if (f.phase !== 'done' && f.toR > 0) {
      const n = 2 * Math.min(300, Math.max(12, Math.floor((Math.PI * f.toR) / 70)));
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        g.moveTo(f.toX + Math.cos(a0) * f.toR, f.toY + Math.sin(a0) * f.toR);
        g.arc(f.toX, f.toY, f.toR, a0, a1);
      }
      g.stroke({ width: 3, color: INK, alpha: 0.3 });
    }
  }

  private drawDebug(w: World, a: number, opts: RenderOpts): void {
    const g = this.debugG.clear();
    if (!opts.debug.hitboxes) return;
    for (const p of w.players) {
      if (!p.alive) continue;
      const form = activeForm(w, p);
      if (!form) continue;
      const pos = this.playerPos(p, a);
      g.circle(pos.x, pos.y, form.radius).stroke({ width: 1, color: 0x2060ff });
      for (const e of form.emitters) {
        const ex = pos.x + e.x * form.size, ey = pos.y + e.y * form.size;
        g.circle(ex, ey, 3).fill(0xff2020);
        g.moveTo(ex, ey).lineTo(ex + e.dx * 30, ey + e.dy * 30).stroke({ width: 2, color: 0xff2020 });
      }
      for (const s of form.shields) {
        const half = (s.width / 2) * (Math.PI / 180);
        const mid = s.facing * (Math.PI / 180);
        const rr = form.radius + 10;
        g.moveTo(pos.x + Math.cos(mid - half) * rr, pos.y + Math.sin(mid - half) * rr);
        g.arc(pos.x, pos.y, rr, mid - half, mid + half);
        g.stroke({ width: 3, color: 0x20a040 });
      }
    }
    for (const m of w.mobs) g.circle(m.x, m.y, m.r).stroke({ width: 1, color: 0x2060ff, alpha: 0.6 });
  }

  private drawMinimap(w: World, opts: RenderOpts): void {
    const g = this.minimap.clear();
    if (!opts.minimap) return;
    const size = Math.min(220, this.app.screen.width * 0.22);
    const pad = 14;
    const ox = this.app.screen.width - size - pad;
    const oy = pad + 40;
    const s = size / MAP_SIZE;
    g.rect(ox, oy, size, size).fill({ color: 0xf3eee2, alpha: 0.92 }).stroke({ width: 2, color: INK });
    const f = w.fog;
    // Fog wash outside the circle.
    const rows = 64;
    const rh = size / rows;
    let strips = 0;
    for (let i = 0; i < rows; i++) {
      const wy = ((i + 0.5) / rows) * MAP_SIZE - f.y;
      const half = f.r > Math.abs(wy) ? Math.sqrt(f.r * f.r - wy * wy) : -1;
      const y = oy + i * rh;
      if (half < 0) {
        g.rect(ox, y, size, rh);
        strips++;
        continue;
      }
      const l = Math.max(0, (f.x - half) * s), r2 = Math.min(size, (f.x + half) * s);
      if (l > 0) (g.rect(ox, y, Math.min(l, size), rh), strips++);
      if (r2 < size) (g.rect(ox + Math.max(0, r2), y, size - Math.max(0, r2), rh), strips++);
    }
    // Only fill when strips exist: fill() with no new shapes would refill the background rect.
    if (strips) g.fill({ color: 0x5f5a54, alpha: 0.35 });
    if (f.phase !== 'done' && f.toR > 0) g.circle(ox + f.toX * s, oy + f.toY * s, Math.max(2, f.toR * s)).stroke({ width: 1.5, color: INK, alpha: 0.6 });
    for (const c of w.copies) {
      if (c.state !== 'ground') continue;
      g.circle(ox + c.x * s, oy + c.y * s, c.upgraded ? 3.2 : 2.4).fill(c.upgraded ? GLOW_UP : 0xd99a1e);
    }
    for (const p of w.players) {
      if (!p.alive) continue;
      const px = ox + p.x * s, py = oy + p.y * s;
      if (p.id === opts.localId) {
        g.circle(px, py, 4.5).fill(INK);
        g.circle(px, py, 7).stroke({ width: 1.5, color: INK });
      } else g.rect(px - 2.5, py - 2.5, 5, 5).fill({ color: INK, alpha: 0.7 });
    }
    const v = this.app.screen;
    g.rect(ox + (this.camX - v.width / 2 / this.zoom) * s, oy + (this.camY - v.height / 2 / this.zoom) * s, (v.width / this.zoom) * s, (v.height / this.zoom) * s).stroke({ width: 1, color: INK, alpha: 0.4 });
  }


  destroy(): void {
    this.app.destroy(true, { children: true, texture: false });
  }
}
