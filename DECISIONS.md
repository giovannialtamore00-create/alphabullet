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
- [M4] Hit flash = brief dark-red ink tint (0.12 s) plus a scale pop; everything else stays black ink. Pickup halos use a warm highlighter glow (gold; red for upgraded copies) so they read on paper.
- [M4] Shield letters emit a thin arc ripple from each curvature every 0.4 s (0.22 s in CAPITAL); blocked hits send an extra ripple.
- [M4] Soundtrack: 152 BPM A-minor loop (Am-F-C-G) with kick/snare/hats, saw bass, square arpeggio, triangle pad; denser when the fog reaches stage 3 or 3 players remain. All synthesized via Web Audio.
- [M4] Shot sounds: very quiet randomized ticks, rate-limited (max ~20/s); other players' sounds fade out beyond 950 px. Audio starts on the first key/click (browser rule). Volume settings persist in localStorage.
- [M5] Screens are DOM overlays (#ui). Menu title is drawn with our own stroke glyphs. Host/Join are disabled "coming soon" until M7.
- [M5] When you die you spectate until the match ends (spec); Esc opens the menu so you can quit early. The end screen shows over the still-running world.
- [M5] Pause overlay contains the audio settings, so settings are reachable mid-match.
- [M6] Vite base './' so the same build works at any GitHub Pages subpath. The workflow runs unit tests before deploying (e2e stays local to keep CI fast).
- [M6] Pushing to GitHub and enabling Pages is the user's final step (README has the steps); GitHub was not set up during kickoff.
- [M7] Online human cap = 6 (bots fill to 8): each extra client costs the host a full snapshot stream; 6 keeps host upload modest. Logged per spec.
- [M7] Transport: PeerJS reliable JSON data channels (simple, ordered). Room code = 5 letters (no I/O) => peer id "alphabullet-v1-CODE".
- [M7] Snapshots at 20 Hz with positions rounded to whole pixels; only mobs within 1400 px of the client's viewed player. Bullets are sent once when they come near and then simulated on the client (straight lines), with a "gone" list for hits — this cut bullet traffic by ~90%.
- [M7] Client prediction: own movement replays unacknowledged inputs on top of the server position (shared moveStep). Everything else is interpolated between snapshots.
- [M7] Online end screen offers only "Back to menu" (no "Play again"; the host re-hosts). Late joiners are rejected once the match starts. Debug panel is host/solo only.
- [M7] Networking is behind a small Conn interface; an in-memory pair drives the unit tests, PeerJS is used in the browser. A Playwright test runs a real two-browser match over the public broker (skips if unreachable).
- [M8] Pacing pass (all-bot matches were ending in 2-4 min): bullets deal 50% damage to players (PVP_DAMAGE_MUL); letters spawn across the whole current circle while the fog waits (spreads players out); mob spawn ramp min(1.6, 0.25 + t/600)/s per player; mob contact dmg 4/6/10 with 0.8 s cooldown; bots kite mobs within 330 px; bot aggression grows with fog stage (avoid players unless clearly ahead in stages 0-1, fight when ahead in stage 2, always from stage 3). Result: bot-only matches now last ~6-7.5 min.
- [Playtest 1] User feedback applied: player speed 200 -> 340 px/s (+70%).
- [Playtest 1] Equal damage: every non-shield letter deals the same total dps (36 lowercase / 61 CAPITAL), split evenly between its emitters (no bonus for extra emitters). Shield letters keep x0.4.
- [Playtest 1] Range per emitter = 1000 px x arm length (stroke length from the free end to the nearest joint; half the stroke if both ends are free), clamped 140-1000 px, x1.2 in CAPITAL. E.g. b: north 554 px, south 140 px. Note: a leg reached via an arch counts the arch too (n's right leg, m's last leg are long-range).
- [Playtest 1] Mob spawn rate at the start x3 (0.25 -> 0.75/s per player, same ramp); mob HP -30% (5.6 / 16.8 / 42).
- [Playtest 2] Mob HP -20% more (4.48 / 13.44 / 33.6).
- [Playtest 2] CAPITAL grants temp HP = 50% of max HP; it soaks damage after shields and before HP, and is removed when CAPITAL ends, when you switch letters, or on death.
- [Playtest 2] Letter levels: 1 = CAPITAL (400 XP, unchanged), 2 = BOLD at 1200 total XP (PLACEHOLDER, not in spec). BOLD is permanent on the copy (kept when dropped), applies to both forms: +30% max HP and +30% bullet damage while active. Max HP follows the active letter and HP scales proportionally on switch, so switching never creates HP. BOLD glyphs are drawn with 1.6x stroke width.
- [Playtest 2] Each mob kill heals 0.5% of the killer's max HP.
- [Playtest 2] Small (slender) mob weight x1.3. Mobs may spawn up to 1400 px beyond the map edge and walk in, so players at the edge are surrounded too.
- [Playtest 2] Spawn rate x1.5 for any player within 900 px of a letter on the ground (map letters and death drops) until it is picked up.
- [Playtest 3] Mob HP -20% more (3.584 / 10.752 / 26.88). Player bullet damage +30% (baseDps 36 -> 46.8, applies to PvP too).
- [Playtest 3] Range-based damage: each emitter keeps its equal share of the letter's DPS, then x(1 + 0.5 x (1000 - range) / (1000 - 140)) using the pre-CAPITAL range. Shortest strokes (140 px) +50%, longest (1000 px) +0%. A letter's total output can now exceed the old per-letter cap; range balances it.
- [Playtest 3] Dot emitters (arm <= 0.06, i.e. the dots of lowercase i and j; data rule, not per-letter) fire a 6-pellet shotgun burst in a 70 deg cone, total x2 damage split across pellets. Point-blank all pellets hit (+100%); farther away pellets spread and miss. Pellet count and cone width are PLACEHOLDER.
- [Playtest 4] Mob contact damage halved (2 / 3 / 5). Chunky mob HP -30% (26.88 -> 18.816).
- [Playtest 4] "Spawn rate escalation +15% per minute" read as compounding growth: rate = 0.75 x 1.15^(minutes) spawns/sec per player (was linear 0.75 + 0.1/min). Old cap 1.6 replaced by 3.0 (PLACEHOLDER), reached at ~11.5 min; the per-player and total mob caps (60 / 300) still apply.
- [Playtest 4] Fog dps x1.5 per stage (3, 4.5, 7.5, 12, 18, 30). Fog already did damage.
- [Playtest 4] Per-letter HP: every letter copy has its own HP pool (100, x1.3 if BOLD). Player.hp mirrors the active letter; switching stores/loads pools. Mob-kill healing and CAPITAL temp HP apply to the active letter only. Inactive letters do not regenerate.
- [Playtest 4] Active letter at 0 HP while another owned letter has HP: that letter drops on the floor near the spot (HP refilled for the next owner, XP/level kept), the player respawns at a safe spot inside the circle, at least 1200 px (PLACEHOLDER) from other players when possible, with their healthiest remaining letter. CAPITAL ends. No kill credit or kill XP for breaking a letter; kills count only on elimination. Losing the last letter eliminates as before. No spawn protection after respawn (not specified).
- [Playtest 4] Disconnect still eliminates: the leaving player's other letters drop first, so it is not treated as a respawn.
- [Playtest 4] HUD: each letter slot shows its own HP bar. NET_VERSION bumped to 2 (snapshot now sends copy HP).
- [Patch: 3 lives] Each player has 3 lives (PLAYER_LIVES in config.ts). Every death (active letter at 0 HP) costs a life and follows the Playtest 4 respawn rule (letter drops, respawn elsewhere). The 3rd death eliminates, even with letters left; owning letters no longer protects from elimination.
- [Patch: 3 lives] Losing your only letter with lives left: respawn with a random pool letter different from the lost one (fallback: any pool letter, then the same letter back). Not specified; chosen so the player always has a gun.
- [Patch: 3 lives] HUD shows hearts next to the INK number; the respawn toast says lives left. Disconnect sets lives to 0. NET_VERSION bumped to 3 (snapshot sends lives).
- [Patch: 3 lives] User answered Playtest 4 questions: yes to spawn protection, yes to kill credit/XP for breaking a letter. Spawn protection: 2 s (PLACEHOLDER) of no damage after a letter-loss respawn; the player blinks. Breaking a letter: +1 kill and 60 XP (PLACEHOLDER, half of an elimination's 120) to the active letter of the last damager. Elimination still gives its own kill + 120 XP. NET_VERSION 4.
- [Patch: word powers] Own every letter of a word, then type it (each letter within 1 s of the previous) to fire its power. Letter keys still switch letters while typing. Repeated letters (PIERCE's two E's) need one copy. Words live in src/sim/words.ts (WORDS table); numbers in config.ts. All PLACEHOLDER: PIERCE 6 s of piercing bullets (each bullet hits a target once), cd 30 s; BOMB 300 px blast, 60 dmg (x0.5 vs players), cd 25 s; DASH 350 px teleport along last move direction, clamped to the map, cd 8 s.
- [Patch: word powers] HUD: one quiet line above the CAPITAL box listing spellable words (UPPERCASE = ready, lowercase + seconds = cooldown); hidden when none. Bots don't use words yet. NET_VERSION 5 (input sends the word, snapshot sends pierce timer + word cooldowns).
- [Patch: guest smoothness] The online guest's own (predicted) letter is now blended between its last two ticks with the local frame clock, like everything else; before, it was drawn at raw 30 Hz positions, so the camera and the whole screen juddered on 60+ Hz displays. Teleports over 200 px (DASH, respawn) still snap. Measured at 60 fps: frame-to-frame speed wobble 1.01 -> 0.05.

## [Balance patch 2026-10-10]
- Damage +30% (baseDps 60.84), fog waits x1.3, mob spawn growth 1.15 -> 1.18/min, speed 340 -> 374, PvP mul 0.5 -> 0.6, CAPITAL duration 20 -> 13 s.
- Levels swapped: Lv1 BOLD at 400 XP, Lv2 CAPITAL at 1200 XP (user chose a plain swap, no new level). BOLD = bullets 25% bigger only; BOLD HP and damage bonuses removed.
- Letters: 3 new letters every 10 s while fewer than 16 lie on the ground (cap 16 is a PLACEHOLDER); old "refill at 4 left after 120 s" rule removed. Game still starts with 8 on the ground.
- O, A, I, E: 4 copies each (60 copies total) and drawn 15% more often.
- B, D, O no longer shoot (data flag noShoot in glyphs.ts); C and Q still do.
- Unit tests that depended on random start letters now use seed 6 (words) because the extra vowel copies changed the random draws.

## [New word powers 2026-10-10]
- Added BOUNCE FREEZE ERASE VOID SPLASH DISARM SPEED LIFE ZAP SPIN FLIP MAGNET (a half-done earlier attempt was kept and finished; PIERCE/BOMB/DASH unchanged). Timers live in Player.fx; network version 7 (snapshot carries fx timers, slow, disarm, splash, black holes, bullet effect flags).
- PLACEHOLDERS (you gave durations only): cooldowns 25-60 s, ERASE radius 200, VOID radius 450 / pull 120 px/s at edge to 800 at centre, ZAP range 170 / 2 jumps / 50% damage, MAGNET radius 1000, SPLASH bot sight x0.4.
- VOID kills through the normal death path: a swallowed player loses the active letter and one life (not instant elimination); the caster is immune to its own hole; spawn-protected players are skipped.
- BOUNCE: a bounced bullet gets a new id so guests receive its new direction. Bullets bounce twice (map edge or target) and live at least 0.35 s after a bounce.
- SPLASH: the screen ink is a CSS overlay at about 60% cover that fades linearly over 5 s; bots hit by it only see enemies at 40% range.
- Shield ripple visuals ignore SPIN/FLIP (the shield hit test does use the pose).
- PUSH (added): radius 400, shoves mobs and enemy players 350 px straight away (clamped to map), cooldown 15 s. All placeholders.
- Renamed words for letter balance: SPIN->WHIRL, SPEED->QUICK, SPLASH->SQUIRT, added PUSH (effects unchanged).

## M22: passive word powers
- PIERCE, BOUNCE, FREEZE, ERASE, DISARM, QUICK, ZAP, MAGNET, CHUNKY, WHIRL, FLIP are passive: typing switches them on for good (no timer, no cooldown). Max 3 (`MAX_PASSIVES`); a 4th removes the oldest. Typing one already on does nothing.
- A passive pauses while a letter of its word is missing, keeps its slot, resumes when regained.
- Kept as typed one-shots: JETPACK, VOID, BOMB, DASH, PUSH, LIFE, EXILE, SQUIRT, XRAY (permanent piercing laser would be too strong).
- Implementation: the fx timer is kept full each tick by `refreshPassives` (words.ts); WHIRL wraps at a whole number of turns so the spin stays smooth.
