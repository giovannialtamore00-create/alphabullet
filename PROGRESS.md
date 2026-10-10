# Progress

## Current
- All milestones done (M1-M8). Phase: finished; waiting for user playtest + GitHub push.
- M8: pacing pass merged (bot-only matches 2-4 min -> 6-7.5 min). One open balance item in BLOCKERS.md.
- Verified at the end: 51 unit tests pass, 3 Playwright tests pass (smoke, full flow, real 2-browser PeerJS match), npm run build passes.
- Playtest rounds 1-4 applied (details in DECISIONS.md "[Playtest N]"). Latest: per-letter HP with respawn on letter loss, halved mob damage, +15%/min compounding spawn ramp, fog x1.5. Also fixed: room-code field blocked typing. Now 71 unit tests + 3 e2e pass.
- Playtest 4 questions answered: spawn protection 2 s (PLACEHOLDER), letter break = kill + 60 XP (PLACEHOLDER). Still to confirm: spawn cap 3/s, respawn 1200 px from players.
- Patch "3 lives" applied: 3 lives per player, each death drops the active letter and respawns; 3rd death eliminates. Only-letter loss respawns with a fresh pool letter (assumption). 73 unit + 3 e2e pass.
- Patch "online guest smoothness" (playtested OK 2026-10-09): guests see other players/mobs ~4 ticks in the past from a snapshot buffer (src/net/interp.ts), and their own predicted letter is blended between ticks. Guest lag/no-shooting seen in playtest was the host running in a background tab (browser pauses requestAnimationFrame, so the host sim stops). The ?lag fake-connection tool was removed at user request.
- Patch "word powers" (built + unit tested, NOT playtested yet): own every letter of a word and type it within 1 s per key: PIERCE, BOMB, DASH. Table in src/sim/words.ts, numbers in config.ts (PLACEHOLDER). 85 unit + 3 e2e pass.
- M11 "word return + word list" (NOT playtested yet): after typing a full word you switch back to the letter held before its first letter (even if the word didn't fire; skips switch cooldown; works online via input field `b`). HUD: vertical list of all words on the left; owned letters glow orange, missing ones faded, solid border when fully owned, cooldown seconds next to it. 87 unit pass.
- Uncommitted on purpose: font-check work (src/render/fonts.ts, tests/e2e/fontcheck.spec.ts, tools/); user said to leave it for now.
- Testing notes: dev server on port 5180 (5173 belongs to another local game); Cloudflare tunnel via `cloudflared tunnel --url http://localhost:5174` (vite allows *.trycloudflare.com). Port 4173 may be taken by another local app; then run e2e with a copy of playwright.config.ts using another port.

- Balance patch (11 changes, see DECISIONS.md "Balance patch"): built, 91 unit + 3 e2e pass, build OK. NOT playtested, NOT committed yet.

## Next steps
2. User: playtest solo + online; report pacing/balance feel (BLOCKERS.md #1).
3. If resumed: tune config.ts knobs from playtest feedback, re-run tests, commit.
4. Word powers open questions: (a) CAPITAL can still end early from the letter switches while typing. (b) Bots don't use words. (c) Word list: glow strength/position OK? hide words with zero owned letters? Then user playtest of words.
5. Recommended fix: keep the host sim running when its tab is hidden (game loop is requestAnimationFrame only, src/game/game.ts frame()), else a host switching tabs freezes the match for everyone.

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
