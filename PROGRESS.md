# Progress

## Current
- All milestones done (M1-M8). Phase: finished; waiting for user playtest + GitHub push.
- M8: pacing pass merged (bot-only matches 2-4 min -> 6-7.5 min). One open balance item in BLOCKERS.md.
- Verified at the end: 51 unit tests pass, 3 Playwright tests pass (smoke, full flow, real 2-browser PeerJS match), npm run build passes.
- Playtest rounds 1-4 applied (details in DECISIONS.md "[Playtest N]"). Latest: per-letter HP with respawn on letter loss, halved mob damage, +15%/min compounding spawn ramp, fog x1.5. Also fixed: room-code field blocked typing. Now 71 unit tests + 3 e2e pass.
- Playtest 4 questions answered: spawn protection 2 s (PLACEHOLDER), letter break = kill + 60 XP (PLACEHOLDER). Still to confirm: spawn cap 3/s, respawn 1200 px from players.
- Patch "3 lives" applied: 3 lives per player, each death drops the active letter and respawns; 3rd death eliminates. Only-letter loss respawns with a fresh pool letter (assumption). 73 unit + 3 e2e pass.
- Patch "online guest smoothness" (playtested OK 2026-10-09): guests see other players/mobs ~4 ticks in the past from a snapshot buffer (src/net/interp.ts), and their own predicted letter is blended between ticks. Guest lag/no-shooting seen in playtest was the host running in a background tab (browser pauses requestAnimationFrame, so the host sim stops). The ?lag fake-connection tool was removed at user request.
- Patch "guest smoothness 2" (built, unit tests pass, pushed on user request): own-position correction fade in ClientSession (see DECISIONS.md). JETPACK drift still unpredicted.
- Patch "word powers" (built + unit tested, NOT playtested yet): own every letter of a word and type it within 1 s per key: PIERCE, BOMB, DASH. Table in src/sim/words.ts, numbers in config.ts (PLACEHOLDER). 85 unit + 3 e2e pass.
- M11 "word return + word list" (NOT playtested yet): after typing a full word you switch back to the letter held before its first letter (even if the word didn't fire; skips switch cooldown; works online via input field `b`). HUD: vertical list of all words on the left; owned letters glow orange, missing ones faded, solid border when fully owned, cooldown seconds next to it. 87 unit pass.
- Uncommitted on purpose: font-check work (src/render/fonts.ts, tests/e2e/fontcheck.spec.ts, tools/); user said to leave it for now.
- Testing notes: dev server on port 5180 (5173 belongs to another local game); Cloudflare tunnel via `cloudflared tunnel --url http://localhost:5174` (vite allows *.trycloudflare.com). Port 4173 may be taken by another local app; then run e2e with a copy of playwright.config.ts using another port.

- Balance patch (11 changes, see DECISIONS.md "Balance patch"): built, 91 unit + 3 e2e pass, build OK. NOT playtested, NOT committed yet.
- Patch 2026-10-10 b (built, 109 unit pass, build OK, NOT playtested): player damage x1.2 (BULLET.baseDps); mob spawn x1.3 at start fading linearly to x0.7 at 10 min (mobPhaseMul); new letters spawn inside the final safe circle while the fog moves (letters.ts spawnCircle); death-drop letters flash after 7 s and vanish to the pool 3 s later (DROP_DECAY, LetterCopy.idle, synced in protocol). Also: 0.5 s immunity when a word power fires (WORD_IMMUNITY, reuses spawnProt, so the player blinks).
- Patch 2026-10-10 c (built, 112 unit pass, build OK, NOT playtested): word powers JETPACK (5 s: fast spin x3 rev/s, fire x2.5, recoil drift opposite the shots), EXILE (other players in a 1600x900 box around you teleported >=2000 px away), XRAY (3 s: switches to your X, piercing unlimited-range lasers, returns to old letter). Numbers in config.ts (JET, EXILE, XRAY) are placeholders; cooldowns 40/45/45.
- Patch 2026-10-10 d (113 unit pass, build OK, NOT playtested): word power CHUNKY (10 s, cooldown 30, both placeholders): body/hitbox/gun positions x1.2, bullets x1.3 (config CHUNKY, bodyMul in combat.ts).
- Patch 2026-10-10 e (113 unit pass, NOT playtested): all bullet range x1.25 (BULLET.rangePerUnit 1250, minRange 175, maxRange 1250); capital keeps its x1.2 on top.
- Patch "guest lag" 2026-10-11 (127 unit + online e2e pass, build OK, NOT playtested, NOT committed): snapshots ~40% smaller and sent on an unreliable WebRTC channel with repeats + 1 s full resync (NET_VERSION 8). Details in DECISIONS.md "[Patch: guest lag]".

- Patch "duplicate shuffle" 2026-10-11 (129 unit pass incl. tests/unit/shuffle.test.ts, tsc OK, NOT playtested, NOT committed): see DECISIONS.md.

## Next steps
2. User: playtest the 2026-10-10 patches (fog, mob pacing, letter waves, drop decay, JETPACK/EXILE/XRAY), then solo + online; report pacing/balance feel (BLOCKERS.md #1).
3. If resumed: tune config.ts knobs from playtest feedback, re-run tests, commit.
4. Word powers open questions: (a) CAPITAL can still end early from the letter switches while typing. (b) Bots don't use words. (c) Word list: glow strength/position OK? hide words with zero owned letters? Then user playtest of words.
5. User: playtest "guest lag" patch online with a friend on a crowded board; then commit. Both players must refresh (NET_VERSION 8).
6. Recommended fix: keep the host sim running when its tab is hidden (game loop is requestAnimationFrame only, src/game/game.ts frame()), else a host switching tabs freezes the match for everyone.

## Milestones
1. Core logic + tests  [done]
2. Input + bots  [done]
3. Rendering + playable solo loop  [done]
4. Effects + audio  [done]
5. Screens + polish  [done]
6. Deploy + README (solo)  [done, push pending user]
7. Multiplayer (PeerJS)  [done]
8. Parking-lot phase  [done]

## Context for a fresh session
- Spec: docs/design.md. Workflow: docs/workflow.md.
- Commands: `npm test`, `npm run build`, `npm run dev`.
- Test runs are capped at 500 ticks; long timers (fog, refill) are tested by calling `updateFog`/`updateWave` with large dt.
- Players are indexed by id (`w.players[id]`); copies by id (`w.copies[id]`).
- Do not put backticks inside double-quoted shell strings (bash executes them). Use the Write/Edit tools for markdown.

## New word powers (built 2026-10-10, needs playtest)
- 13 new words finished: PUSH (added), BOUNCE FREEZE ERASE VOID SQUIRT DISARM QUICK LIFE ZAP WHIRL FLIP MAGNET. Tests in tests/unit/newwords.test.ts (105 unit tests pass, build + 3 e2e pass).
- Committed and pushed without a playtest verdict (user asked). Includes the unrelated guest-rejoin and font work that was in the tree.
- Open: placeholder numbers listed in DECISIONS.md; check visuals (black hole, zap, ink, flip/spin) and online play.

## M19 patch (2026-10-10, needs playtest)
- Mob spawn rate flat at 2x the old t=0 rate (no escalation). First fog wait 30s. baseRate 6 -> 6.9 (+15% fire rate). All XP +25%. Damage absorbed by a shield now gives XP to the active shield letter.
- Tests updated (levels spawn test, bots pickup test delays fog). 113 unit tests pass.
- Open: bots flee to the safe zone from 30s; check bot behavior early.

## M20 patch (2026-10-10, needs playtest)
- Lowercase B/D shoot from stem ends (capital B/D and O silent). Letter draw: owned letters weighted 1/(1+2*owned); G/J/V/W (<=1 word) x0.85. Mob spawn x2 again (MOB_SPAWN_MUL 3.4). Global mob cap = 60 per 1600x900 of min(map, fog circle) area; per-player 60 kept; old 300 cap removed.
- 114 unit tests pass.

## M21: mob spawn decay (needs playtest)
- Mob spawn rate drops 3% (compounding) every 15 s, fixed from 4 min (about 61% of start). `MOB_SPAWN_DECAY` in config.ts.

## M22: passive word powers (needs playtest)
- See DECISIONS.md M22. Tests in tests/unit/passives.test.ts. Synced online via the snapshot tail (protocol.ts).

## M23: bot fluidity + word tweaks (needs playtest)
- Bots: smoothed steering + hysteresis on 8-way keys, always pick a sticky letter target, lean toward letters while fighting (src/sim/bots.ts).
- DISARM lock 0.3s. ZAP chains until no new target in range (cap 50). EXILE may land up to 20% of safe radius into fog. XRAY 5s, continuous ray (30 shots/s), 2x DPS. Shield blocks heal 1:1 (SHIELD.healFrac). ERASE now active: 12s, 45s cooldown (no passive slot).
- Tests: tests/unit/wordtweaks.test.ts, bots.test.ts; 125 unit tests pass.
- Open: playtest all of the above; tune SHIELD.healFrac, XRAY ray look, bot letter pull.

- Wave/fog pacing patch: waves 5 s sooner in first 2 min, fog stages 2+ 20% slower. Built, tsc + 125 tests pass, needs playtest, not committed.

## M28: XP levels 3/4 + speed (needs playtest)
- Lv3 (2400 XP) +15% damage, Lv4 (4000 XP) +20% fire rate, derived from copy XP (combat.ts xpDamageMul/xpRateMul). PLAYER_SPEED 393 (+5%). Test: tests/unit/xpLevels.test.ts; 130 tests pass.
- Open: playtest; tune thresholds in XP (config.ts).

- Letter bar sorted by level (highest left); frame grows per level (lv0-4, hud.ts + style.css). XP thresholds now BOLD 600, CAPITAL 1000, Lv3 1200, Lv4 1400. Needs playtest.
