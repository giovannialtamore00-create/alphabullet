# Decisions

Every judgment call, newest at the bottom. Format: `- [M<n>] decision. Why.`

- [M0] CLAUDE.md is a short index; spec lives in docs/design.md, workflow in docs/workflow.md. Keeps context small.
- [M0] GitHub not set up yet (user will do it later). M6 prepares the Pages workflow and step-by-step guide; pushing/enabling Pages is the user's final step.
- [M0] Kickoff rules override global pause/2-fix rules for this project: no pauses between milestones, park after ~3 approaches. Run caps still apply.
- [M1] Sim runs at 30 ticks/s with a seeded mulberry32 RNG; `hashWorld` fingerprints state for replay tests.
- [M1] Emitter derivation: a stroke end is an emitter if it touches no other stroke (eps 0.045 unit). Direction = last segment direction; arc terminals point halfway between tangent and outward radius. Directions snap to 8 ways for readability (so A's slanted legs fire straight down).
- [M1] An end whose shot would pass through its own glyph within 0.22 units is dropped (e.g. the stem top under the dot of i/j). Dots fire up.
- [M1] Shield letters: O, D, B (spec) plus C and Q (they are bowls/curves). Shields are arcs marked in glyph data. Lowercase b/d/q shields sit on the bowl side (d and q guard the left, b the right).
- [M1] Shield cap = 40 x (1 - 0.5 x coverage) dmg/s: O/Q (all-round) 20, C 25, D/B 30; CAPITAL x1.75. Implemented as a token bucket refilling at cap/s.
- [M1] Shield glyphs with no free ends (O, CAPITAL D/B) fire weak pulses from their curves (O: 4 ways, D/B: right) so they can still earn XP.
- [M1] Bullet balance: total dps = 36 x (1 + 0.1 per extra emitter); rate = 6/sqrt(emitters); per-bullet dmg = total/(n x rate). Shield letters x0.4, CAPITAL x1.7 dps, x1.6 bullet size, x1.15 speed. Range ~540 px.
- [M1] XP: 1 per damage dealt, +6 per mob kill, +120 per player kill; threshold 400. Upgraded copies keep XP state when dropped.
- [M1] Switching away from a letter during CAPITAL ends it and starts its 45 s cooldown. CAPITAL timer/cooldown live on the letter copy.
- [M1] "8 letters on the map" counts only wave-spawned letters; death drops are extra. Refill timer starts when 4 or fewer wave letters remain, if the pool still has copies.
- [M1] New letters spawn inside the NEXT fog circle (so they are not swallowed soon), never inside the fog, >=700 px from last wave's spots when possible.
- [M1] Fog: 6 stages (3200, 1800, 900, 400, 150, 0 px radius), waits 120/90/75/60/45/30 s, shrinks 60/50/40/30/30/30 s => closes at 11 min. Fog dps 2,3,5,8,12,20. Fog damage ignores shields.
- [M1] Mob tiers: slender (/ ( ) ! |) 8hp 150px/s; medium (% = " ?) 24hp 105px/s; chunky (# @ £ $ &) 60hp 68px/s. All slower than players (200). Contact cooldown 0.6 s. Spawn 1050-1300 px from a player at 0.8/s ramping to 4/s; despawn beyond 2600 px from every player.
- [M1] Simultaneous deaths: least-negative HP places best; if the last players die together, that one wins.
- [M1] Players do not collide with each other physically; only bullets and mob contact interact.
- [M2] Bots steer with weighted forces: fog safety (heads for the next circle when <40 s of wait remain), mob kiting (230 px), aim-by-moving vs the nearest enemy (stand where one emitter's ray hits them, ~320 px away, slight strafe), else collect letters (<1600 px) or wander. Output is quantized to 8-way arrow input.
- [M2] Bots flee when HP < 25 and the enemy has more HP. They re-evaluate letters every 4-10 s (swarm -> more emitters, duel -> heavier bullets, low HP -> shield letter, prefer ready CAPITAL), and fire CAPITAL when an enemy is within 650 px or 5+ mobs are close.
- [M2] Bots use their own seeded RNG (not the world RNG) so a match replays exactly from seed + recorded inputs.
- [M2] Letter keys read `KeyboardEvent.code` (works with Shift held and on non-QWERTY layouts). Tab/Esc are UI actions, not sim input.
- [M3] Glyph textures are drawn with Canvas 2D from the stroke data (white, tinted to ink) and uploaded as Pixi textures; sprites batch well. Same drawer is used for HUD letter keys.
- [M3] Glyph size raised to 54 px (lowercase) / 74 px (CAPITAL) per unit box for readability.
- [M3] Camera zoom = clamp(min(w/1600, h/900), 0.6, 1.4) so mobs (spawned 1050+ px away) appear off-screen on any window.
- [M3] Minimap is ON by default (top-right); Tab toggles it. HUD is a DOM overlay in Courier New (system font; game glyphs are all our own strokes).
- [M3] Fog is drawn as a thick grey ring outside the circle (no polygon holes); next safe zone is a dashed ink circle in the world and on the minimap.
- [M3] Rendering interpolates players/mobs/bullets between 30 Hz sim ticks.
- [M3] When dead, left/right arrows cycle the spectated player.
