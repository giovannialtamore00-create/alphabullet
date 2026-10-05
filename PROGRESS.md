# Progress

## Current
- Milestone: 3 (rendering + playable solo loop). Phase: build.
- M1 done (core sim, 37 tests). M2 done: `src/sim/bots.ts` (botInputs, own RNG per bot), `src/input/keyboard.ts` (Keyboard.poll()). 44 tests pass.

## Next steps
1. `src/render/`: Pixi app, paper texture (generated canvas), glyph drawing from stroke data, camera follow, entities (players, mobs, bullets, pickups), fog wash, minimap.
2. `src/game/`: fixed-timestep loop (accumulator, 30 Hz) driving sim + bots + keyboard; HUD (DOM overlay).
3. `?debug` panel: god, give letter, upgrade, spawn mobs, hitboxes/emitters/shields, FPS/entities.
4. Playwright smoke test (start vs-bots, no console errors). Checkpoint `M3: rendering and playable solo loop`.

## Milestones
1. Core logic + tests  [done]
2. Input + bots  [done]
3. Rendering + playable solo loop
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
