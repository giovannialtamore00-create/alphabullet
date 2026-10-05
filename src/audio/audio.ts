/** Web Audio synth: a fast looping soundtrack and all sound effects. No audio files. */

const STORE = 'alphabullet.audio';

export interface AudioSettings {
  music: number; // 0..1
  sfx: number; // 0..1
  muted: boolean;
}

export type Sfx =
  | 'shot'
  | 'shotCap'
  | 'hit'
  | 'hurt'
  | 'mobDeath'
  | 'playerDeath'
  | 'pickup'
  | 'switch'
  | 'upgrade'
  | 'capital'
  | 'shield'
  | 'ui';

const MIN_GAP: Partial<Record<Sfx, number>> = { shot: 0.05, shotCap: 0.06, hit: 0.035, hurt: 0.08, mobDeath: 0.03, shield: 0.09 };
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// A minor loop: Am - F - C - G (roots as MIDI, chord intervals).
const PROG: [number, number[]][] = [
  [45, [0, 3, 7]],
  [41, [0, 4, 7]],
  [48, [0, 4, 7]],
  [43, [0, 4, 7]],
];
const ARP = [0, 1, 2, 3, 2, 1, 0, 2];

export class AudioEngine {
  settings: AudioSettings = { music: 0.5, sfx: 0.7, muted: false };
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private last = new Map<Sfx, number>();
  private musicOn = false;
  private nextT = 0;
  private stepN = 0;
  private timer = 0;
  /** 0 calm .. 2 frantic: adds hats and lead density. */
  intensity = 0;

  constructor() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) this.settings = { ...this.settings, ...JSON.parse(raw) };
    } catch {
      /* storage unavailable: keep defaults */
    }
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  /** Browsers only allow audio after a user gesture. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.apply();
    if (this.musicOn) this.startScheduler();
  }

  setSettings(s: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...s };
    try {
      localStorage.setItem(STORE, JSON.stringify(this.settings));
    } catch {
      /* ignore */
    }
    this.apply();
  }

  private apply(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : 1, t, 0.02);
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.02);
  }

  // ---------- Music ----------

  startMusic(): void {
    this.musicOn = true;
    if (this.ctx) this.startScheduler();
  }

  stopMusic(): void {
    this.musicOn = false;
    clearInterval(this.timer);
    this.timer = 0;
  }

  private startScheduler(): void {
    if (this.timer || !this.ctx) return;
    this.nextT = this.ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  private schedule(): void {
    const ctx = this.ctx!;
    const sixteenth = 60 / 152 / 4;
    while (this.nextT < ctx.currentTime + 0.12) {
      this.playStep(this.stepN, this.nextT);
      this.nextT += sixteenth;
      this.stepN++;
    }
  }

  private playStep(i: number, t: number): void {
    const bus = this.musicBus;
    const s = i % 16;
    const bar = Math.floor(i / 16) % 4;
    const section = Math.floor(i / 64) % 2; // A/B variation every 4 bars
    const [root, chord] = PROG[bar];
    // Drums
    if (s % 4 === 0) this.kick(t, bus);
    if (s === 4 || s === 12) this.snare(t, bus);
    if (s % 2 === 1 || this.intensity > 1) this.hat(t, bus, s % 4 === 2 ? 0.06 : 0.035);
    if (section === 1 && s === 14) this.snare(t, bus, 0.5);
    // Bass: driving eighths with octave pops.
    if (s % 2 === 0) {
      const oct = s === 6 || s === 14 ? 12 : 0;
      this.tone(mtof(root - 12 + oct), t, 0.11, 'sawtooth', 0.16, bus, 900);
    }
    // Arpeggio lead.
    if (s % 2 === 0 || this.intensity > 0.5) {
      const idx = ARP[(s >> (this.intensity > 0.5 ? 0 : 1)) % ARP.length];
      const notes = [...chord, 12];
      const m = root + 12 + notes[idx % notes.length] + (section === 1 ? 12 : 0);
      this.tone(mtof(m), t, 0.09, 'square', 0.045, bus, 2600);
    }
    // Pad stab on the bar's first beat.
    if (s === 0) for (const iv of chord) this.tone(mtof(root + 12 + iv), t, 0.5, 'triangle', 0.035, bus, 1800);
  }

  // ---------- Primitives ----------

  private tone(freq: number, t: number, dur: number, type: OscillatorType, gain: number, dest: AudioNode, cutoff = 0, glideTo = 0): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(t: number, dur: number, gain: number, dest: AudioNode, type: BiquadFilterType, freq: number, q = 1, sweepTo = 0): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private kick(t: number, d: AudioNode): void {
    this.tone(140, t, 0.16, 'sine', 0.55, d, 0, 45);
  }
  private snare(t: number, d: AudioNode, v = 1): void {
    this.noiseHit(t, 0.12, 0.22 * v, d, 'bandpass', 1800, 0.8);
    this.tone(220, t, 0.06, 'triangle', 0.1 * v, d);
  }
  private hat(t: number, d: AudioNode, v: number): void {
    this.noiseHit(t, 0.03, v, d, 'highpass', 7000);
  }

  // ---------- Sound effects ----------

  /** Play a sound effect; `vol` scales it (e.g. by distance). */
  play(name: Sfx, vol = 1): void {
    const ctx = this.ctx;
    if (!ctx || vol <= 0.02 || this.settings.muted) return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0;
    if (gap && now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);
    const d = this.sfxBus;
    const t = now + 0.005;
    const r = (a: number, b: number) => a + Math.random() * (b - a);
    switch (name) {
      case 'shot': // very quiet, varied ink "tick"
        this.noiseHit(t, r(0.025, 0.045), 0.05 * vol, d, 'bandpass', r(2400, 4200), 3);
        this.tone(r(700, 1100), t, 0.03, 'triangle', 0.018 * vol, d);
        break;
      case 'shotCap':
        this.noiseHit(t, 0.06, 0.08 * vol, d, 'bandpass', r(1200, 2000), 2);
        this.tone(r(300, 420), t, 0.06, 'square', 0.03 * vol, d, 1500);
        break;
      case 'hit':
        this.noiseHit(t, 0.05, 0.12 * vol, d, 'lowpass', 1600);
        this.tone(r(180, 240), t, 0.05, 'sine', 0.12 * vol, d, 0, 90);
        break;
      case 'hurt':
        this.tone(160, t, 0.15, 'sawtooth', 0.18 * vol, d, 700, 70);
        this.noiseHit(t, 0.1, 0.18 * vol, d, 'lowpass', 900);
        break;
      case 'mobDeath':
        this.tone(r(500, 800), t, 0.09, 'square', 0.06 * vol, d, 2200, r(120, 200));
        this.noiseHit(t, 0.08, 0.08 * vol, d, 'bandpass', r(900, 1500), 1.5);
        break;
      case 'playerDeath':
        this.tone(330, t, 0.9, 'sawtooth', 0.22 * vol, d, 1200, 55);
        this.noiseHit(t, 0.7, 0.3 * vol, d, 'lowpass', 2500, 0.7, 200);
        break;
      case 'pickup':
        this.tone(mtof(76), t, 0.12, 'triangle', 0.2 * vol, d);
        this.tone(mtof(83), t + 0.08, 0.2, 'triangle', 0.2 * vol, d);
        break;
      case 'switch':
        this.noiseHit(t, 0.12, 0.12 * vol, d, 'bandpass', 600, 2, 3500);
        break;
      case 'upgrade':
        [72, 76, 79, 84].forEach((m, i) => this.tone(mtof(m), t + i * 0.07, 0.25, 'square', 0.07 * vol, d, 3000));
        break;
      case 'capital':
        for (const m of [45, 52, 57]) this.tone(mtof(m), t, 0.8, 'sawtooth', 0.09 * vol, d, 1800, mtof(m + 12));
        this.noiseHit(t, 0.6, 0.25 * vol, d, 'bandpass', 300, 1, 5000);
        this.kick(t, d);
        break;
      case 'shield':
        this.tone(r(1500, 1900), t, 0.12, 'sine', 0.07 * vol, d);
        this.tone(r(2600, 3000), t, 0.06, 'sine', 0.03 * vol, d);
        break;
      case 'ui':
        this.tone(880, t, 0.05, 'triangle', 0.08 * vol, d);
        break;
    }
  }
}

export const audio = new AudioEngine();
