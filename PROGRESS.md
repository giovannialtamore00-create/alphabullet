# Progress

## Current
- All milestones done (M1-M8). Phase: finished; waiting for user playtest + GitHub push.
- M8: pacing pass merged (bot-only matches 2-4 min -> 6-7.5 min). One open balance item in BLOCKERS.md.
- Verified at the end: 51 unit tests pass, 3 Playwright tests pass (smoke, full flow, real 2-browser PeerJS match), npm run build passes.
- Playtest rounds 1-4 applied (details in DECISIONS.md "[Playtest N]"). Latest: per-letter HP with respawn on letter loss, halved mob damage, +15%/min compounding spawn ramp, fog x1.5. Also fixed: room-code field blocked typing. Now 71 unit tests + 3 e2e pass.
- Playtest 4 open questions for the user: spawn protection after respawn? kill credit/XP for breaking a letter? placeholders (spawn cap 3/s, respawn 1200 px from players) OK?
- Testing notes: dev server on port 5174; Cloudflare tunnel via `cloudflared tunnel --url http://localhost:5174` (vite allows *.trycloudflare.com). Port 4173 may be taken by another local app; then run e2e with a copy of playwright.config.ts using another port.

## Next steps
1. User: push to GitHub and enable Pages (README "Deploy to GitHub Pages").
2. User: playtest solo + online; report pacing/balance feel (BLOCKERS.md #1).
3. If resumed: tune config.ts knobs from playtest feedback, re-run tests, commit.

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
