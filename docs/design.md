# Alphabullet design spec

Source: kickoff prompt, game sections (verbatim). Do not edit without logging in DECISIONS.md.

## Concept
**Alphabullet** is a top-down 2D multiplayer bullet-hell arena with swarming enemies, in the spirit of the "survivors-like" genre (huge open map, hordes of melee enemies, automatic shooting). Each player *is* a letter of the alphabet. The letter fires automatically and endlessly from the free stroke ends of its glyph, in the directions those strokes point. For example, the legs of A fire straight down (south). Players never rotate, so the shape of your letter *is* your weapon pattern, and you aim by moving. Up to 8 players share one very large map, with empty slots filled by bots. Players are hostile to each other. Keyboard-symbol enemies (`! " £ $ % & / ( ) = # @` …) swarm everyone. You collect more letters from the map, steal them by killing other players, and power them up into their CAPITAL form.

**The ONE core mechanic that must be done well:** *the glyph is the gun.* Every letter's bullet pattern and every shield must come visibly and readably from the letter's actual shape, so players can predict how a letter fights just by looking at it. Switching letters must feel like changing weapons, and positioning must matter.

**Out of scope for this MVP:** no story, no accounts or persistent progression between matches, no cosmetics or shop, no mobile/touch controls, no chat, no matchmaking beyond room codes, and no mob abilities beyond melee (more mob effects will come later). Menus are limited to start, lobby, settings, pause and end-of-match screens.

IP rule: everything must be original. No characters, names, logos, music, sounds or assets from any existing franchise, and no near-miss "sound-alike" names. Do not ship a third-party font file: draw all glyphs (letters and symbols) yourself as stroke paths in code, so stroke ends, shooting points and shield curves are defined by your own data.

## Platform and tech stack
Desktop web browser (keyboard), with no install for players. Stack: **Vite + TypeScript + PixiJS (WebGL)**, built as a static site. PixiJS is chosen because hundreds of bullets and mobs on screen need GPU batching. If it causes problems, fall back to Canvas 2D and log the reason in DECISIONS.md.
- Assets: all visuals procedural or drawn in code. Letters and symbols are your own stroke-path glyphs. The paper texture is generated in code (noise, grain, faint fibers). No external image files.
- Audio: synthesized with the Web Audio API, with no audio files. This includes a fast-paced looping soundtrack and sound effects (see Presentation).
- Unit tests: Vitest. Use Playwright (headless Chromium) for a smoke test that loads the built game, starts a bot match and checks there are no console errors.

## Architecture
- Keep core game logic (rules, state, simulation) in a pure module with no rendering or DOM imports, deterministic where practical, and fully unit-testable. Build and test it first.
- Keep rendering, input, audio, UI and networking in separate modules on top of it.
- Use a fixed-timestep simulation (e.g. 30 or 60 ticks/sec) driven by a seeded RNG, so a match can be replayed from a seed plus inputs in tests.
- **Glyph data module:** one data file defines every letter (lowercase base form and CAPITAL form) as stroke paths. For each form, mark: emitter points (free stroke ends plus firing direction), shield arcs (curvatures, with facing and arc width), collision shape, and bullet stats. Shooting and shields must be *derived from this data*, not hand-coded per letter, so adding or tweaking a letter is a data change.
- Use a spatial hash/grid for collisions (bullets vs. players/mobs, mobs vs. players), because the map is very large and entity counts are high.
- Bots use the same input interface as humans, so the simulation can't tell them apart.
- Networking sits on top of the pure sim: the host runs the authoritative sim, and clients send inputs and receive snapshots.

## Gameplay and rules
**Match flow**
1. A host creates a room and shares a room code. Up to 7 friends join. When the host starts, empty slots up to 8 are filled with bots. A solo "Play vs bots" button starts a match immediately with 7 bots.
2. Each player spawns at a random spread-out location with **2 random letters** drawn from the available pool.
3. Players move with the **arrow keys** (8 directions). Your active letter fires automatically and continuously from all its emitters. There is no aiming and no rotation; the letter is always upright.
4. Mobs (keyboard symbols) continuously spawn off-screen around players and swarm toward the nearest player. They only attack by touching (melee damage) and never shoot.
5. Players damage each other with bullets. Mobs and players both block and absorb bullets.
6. **Win condition:** last player standing wins. Death is final: there are no respawns (for now). A dead player becomes a spectator who can cycle between surviving players, and sees the end screen when the match ends.
7. **Closing fog:** as time goes by, a fog closes in on the arena and shrinks the playable area, forcing players to meet and fight. Standing inside the fog deals damage over time. The fog shrinks in stages, with a pause between stages, toward a final small circle at a random spot. It is drawn in the ink-on-paper style, e.g. a smudged grey wash over the paper, and shown on the minimap along with the next safe zone. Balance timings sensibly so a full match lasts about 10–15 minutes. Letters never spawn inside the fog.

**Letters (your arsenal)**
- You own several letters but you *are* only one letter at a time. Press a letter's key (e.g. `A`) to switch to it if you own it. Switching has a short cooldown (~0.5 s) and a quick morph animation.
- Base form = **lowercase** glyph (a, b, c…). Upgraded form = CAPITAL glyph (see Upgrades).
- Bullets come from each emitter of the current glyph in the direction that stroke points. For example, in CAPITAL form, `A` fires down from its legs, `T` fires from both arm ends sideways and the stem downward, and `X` fires from four diagonal ends. Lowercase forms work the same way, from their own strokes. Letters with more emitters fire weaker or slower bullets per emitter, so total output stays balanced. Balance sensibly across all 26 letters.
- **Shield letters:** letters without legs or pointy ends, specifically **O, D, B** (and you may judge others, e.g. C, Q, logging each in DECISIONS.md), get a defensive shield instead of, or in addition to weak, shooting. Little waves continually propagate from their curvatures and fade out. Each shield blocks up to a **max damage per second** from both bullets and mobs. Damage beyond that per-second cap still reaches the player.
  - **O**: all-round shield, so it has a *lower* per-second cap.
  - **D** and **B**: almost one-sided shield (the curved side), so it has a *higher* cap. Damage from the uncovered side is not blocked.

**Pickups and the letter pool**
- The pool holds **2 copies of each letter (26 × 2 = 52 total)**. No more than 2 players can ever hold the same letter at the same time. A player can never hold two copies of the same letter: walking over a letter you already own does nothing.
- At match start, **8 letters** are placed at random spread-out spots on the map (not counting players' starting letters, which also come from the pool).
- Letters on the ground glow and pulse to signal their presence. Walk over one to pick it up.
- **Respawn rule:** once 50% of the letters on the map (4 of the 8) have been picked up, a **2-minute timer** starts. When it ends, new letters spawn to refill the map to 8, in *different* spots from before. New letters appear on the minimap.
- When every copy in the pool is owned or lying on the ground, no more letters spawn.
- **On death:** all letters the player owned drop and scatter close to where they died, as normal glowing pickups that anyone can collect. They keep their upgrade state, and the 2-copy and no-duplicate rules still apply.

**Upgrades (CAPITAL form)**
- Each owned letter earns its own XP from damage dealt and kills (mobs and players) while that letter is active. When a letter crosses its XP threshold, it is upgraded and its CAPITAL power is unlocked. Show this clearly.
- Activate it by pressing **Shift** (the key used to type capitals) while that letter is active. For **20 seconds**, the letter becomes its CAPITAL glyph: new shape, new emitters/shooting pattern, bigger bullets and more damage. Shield letters get stronger shields.
- After the 20 seconds it reverts and goes on cooldown (balance sensibly, ~45 s).
- **The upgrade is bound to the letter, not the player.** XP progress and unlocked status belong to that letter copy. When a player dies, their letters drop *with* their upgrade state. Whoever picks up an upgraded letter gets its CAPITAL power already unlocked. An upgraded pickup on the ground looks distinct, e.g. shown as its capital glyph or with a stronger glow.

**Starting numbers (rough; balance sensibly and log changes)**
- Player HP 100, no passive regen. Player speed ~200 px/s.
- Map ~8000 × 8000 px with soft edges. The camera follows the player.
- Mob tiers by shape: slender symbols (`/ ( ) ! |`) are fast, small and low-HP. Medium symbols (`% = " ?`) are average. Chunky symbols (`# @ £ $ &`) are slow, big and high-HP. Melee damage is per touch with a short contact cooldown.
- Mob density ramps up over time. Cap active mobs per player to protect performance (~60 per player, ~300 total).

**Edge cases**
- Pause (Esc) only truly pauses in solo vs-bot matches. Online, Esc opens the settings overlay while the game keeps running.
- If a human disconnects, their character is removed and drops their letters as on death. If the host disconnects, end the match for everyone with a clear message.

## Content
- **26 letters**, each with a lowercase base form and a CAPITAL form, all drawn as your own stroke glyphs with emitters and shields derived from the shape. Write a short one-line description per letter in a content table (e.g. in README or DECISIONS.md).
- **Mobs:** at least 12 keyboard symbols from `! " £ $ % & / ( ) = # @`, in the three shape-based tiers above. They are melee only, with no special abilities yet. Keep the mob definition data-driven, so new effects can be added later.
- **Bots:** fill empty slots up to 8. Bots wander toward visible letter pickups, kite mobs, fight nearby players, switch letters and use their CAPITAL power. Give them simple distinct names generated from letters (e.g. "Bot-K7"), not real names.

## Controls and input
- **Arrow keys:** move (8 directions).
- **Letter keys A–Z:** switch to that owned letter.
- **Shift:** activate the CAPITAL power of the active letter (if upgraded and off cooldown).
- **Tab:** toggle the minimap overlay, at any time. The minimap shows you, other players, and letter pickups. M is not used because letter keys are taken.
- **Esc:** settings/pause.
- **Debug mode** (URL flag `?debug`): God mode, give-any-letter, instant upgrade, spawn mobs, show hitboxes/emitters/shield arcs, and an FPS/entity counter. This lets the sim be tested without skill.

## Multiplayer
- **This is the LAST build milestone.** The full solo vs-bots game, with screens, polish and deployment, must be complete and deployed before you start it.
- Mode: free-for-all, up to 8 players online, with bots filling empty slots. If 8 online players is too heavy, it is acceptable to cap human players at 6 or 4. Bots still fill the match up to 8, and the cap is logged in DECISIONS.md.
- Connection: the host clicks "Host", gets a short room code and shares it. Friends click "Join" and enter the code. Use **peer-to-peer WebRTC via PeerJS** (public broker, no server and no account needed), so the game stays a static site.
- Host-authoritative: clients send inputs every tick, and the host runs the sim (including bots) and sends compact snapshots ~20 times per second. Clients interpolate other entities and predict their own movement.
- Bandwidth matters (many bullets and mobs): send only entities near each client, and quantize positions. If 8-player P2P with full bullet hell proves too heavy, first reduce the snapshot scope, then lower the human-player cap to 6 or 4, before cutting any mechanics.
- Handle disconnects as described in Edge cases. "Play vs bots" must work fully offline for solo testing.

## Presentation
- **Scene and visuals:** the floor is a paper-textured sheet (subtle grain, fibers, slight warm off-white), and **every sprite on it is black ink**: letters, symbols, bullets and shield waves. Pickups glow with a soft pulsing halo and a pulsating scale animation. Use hit flashes, small ink-splat death effects, an ink "morph" when switching letters, and a bold, slightly larger inky transformation for CAPITAL mode. Shield waves are thin arcs that ripple out from curvatures and fade. Use light screen shake on big hits. Your own character is marked so you can always find it (e.g. a small underline or ring beneath it), still in black.
- **UI and HUD:** HP bar, your owned letters as a row of keys with the active one highlighted, an XP bar for the active letter, CAPITAL power readiness/cooldown and the 20-second timer, players alive, match timer, a respawn timer for the next letter wave, and a countdown to the next fog stage. The Tab minimap overlay shows players, pickups, the fog and the next safe zone. When you're inside the fog, show a clear warning.
  - Screens: start screen (Play vs bots / Host / Join / Settings), lobby (room code, player list, start), settings, pause/settings overlay, and an end screen (winner, your placement, kills, letters collected) with Play again and Back to menu. The UI uses the same black-ink-on-paper style.
- **Audio:** a fast-paced synthesized looping soundtrack. Sound effects for shooting (very quiet and varied, so constant auto-fire isn't tiring), hits, mob deaths, player death, pickup, letter switch, upgrade unlock, CAPITAL activation, and shield blocks. **Settings:** separate volume sliders for music and sound effects, plus a mute toggle.

## Process
Build in milestones, and finish each one with a CHECKPOINT:
1. Scaffold, core game logic, and unit tests for the main rules: glyph data and emitter/shield derivation, movement, bullets and collisions, shield per-second cap, the letter pool (2 copies, no duplicates), pickups, the 50% + 2-minute respawn rule, drops on death (with upgrade state kept on the letter), XP and upgrades, the closing fog, and the last-player-standing win condition.
2. Input system and bots, with tests. Arrow movement, letter switching, Shift power, Tab minimap. Bots use the same input interface, and they respect the fog.
3. Rendering and a playable single-player vs-bots loop: paper floor, ink glyphs, camera, big map, mobs swarming, fog, HUD and minimap.
4. Effects and audio: glows, pulses, shield waves, hit/death effects, CAPITAL transformation, soundtrack, sound effects and audio settings.
5. Screens and polish, including a full flow from start screen to end screen and back. Online buttons can be hidden or marked "coming soon" until milestone 7.
6. Deployment and README for the solo vs-bots game.
7. Multiplayer (last build milestone): PeerJS host/join with room codes, host-authoritative sync, bot fill up to 8, human cap of 6 or 4 if needed, disconnect handling. Then update README and redeploy.
8. The parking-lot final phase (see "Handling hard problems").

After each milestone, run the tests and the build and fix all errors before moving on.

## Deliverables
- A working game that runs locally with one documented command and builds for release with another.
- Deployment: a GitHub Actions workflow that builds and deploys to GitHub Pages, with step-by-step instructions for a non-expert (creating the repo, pushing, enabling Pages).
- README.md covering how to run, how to deploy, how to play (controls and rules), requirements, and known limitations.
- DECISIONS.md listing every judgment call you made.
- BLOCKERS.md, even if empty.
- PROGRESS.md, current to the last step.

When done, give me a short summary: what works, what's rough, remaining blockers and what you need from me for each, any final step left for me (such as deployment), and what I should test first. Then do a final checkpoint.
