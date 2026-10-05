# Progress

## Current
- Milestone: 4 (effects + audio). Phase: build.
- M3 done: src/render/ (renderer.ts, glyphCanvas.ts, paper.ts), src/ui/hud.ts, src/game/game.ts (loop, events, spectate), src/debug/debugPanel.ts, src/main.ts starts a solo match directly. Smoke test tests/e2e/smoke.spec.ts passes; VISUAL=1 npx playwright test visual writes test-results/visual.png for a manual look.

## Next steps
1. src/render/effects.ts: hit sparks, ink-splat deaths, shield waves rippling from curvatures (from shieldBlock events + idle ripples), switch morph puffs, bold CAPITAL transformation burst, pickup glow burst. Subscribe via game.onEvents.
2. src/audio/audio.ts: Web Audio synth: looping fast soundtrack (sequenced), SFX for shot (quiet, varied), hit, mob death, player death, pickup, switch, upgrade, CAPITAL, shield block. Music/SFX volume + mute settings (persist in localStorage).
3. Checkpoint M4.

## Milestones
1. Core logic + tests  [done]
2. Input + bots  [done]
3. Rendering + playable solo loop  [done]
4. Effects + audio
5. Screens + polish
6. Deploy + README (solo)
7. Multiplayer (PeerJS)
8. Parking-lot phase

## Context for a fresh session
- Spec: docs/design.md. Workflow: docs/workflow.md.
- Commands: `npm test`, `npm run build`, `npm run dev`.
- Test runs are capped at 500 ticks; long timers (fog, refill) are tested by calling `updateFog`/`updateWave` with large dt.
- Players are indexed by id (`w.players[id]`); copies by id (`w.copies[id]`).
- Do not put backticks inside double-quoted shell strings (bash executes them). Use the Write/Edit tools for markdown.
