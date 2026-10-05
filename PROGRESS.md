# Progress

## Current
- Milestone: 2 (input + bots). Phase: build.
- M1 done: `src/sim/` (config, rng, glyphs, glyphDerive, types, spatialHash, combat, letters, fog, mobs, world). 37 unit tests in `tests/unit/` pass. `npm run build` passes (stub `src/main.ts`).

## Next steps
1. `src/sim/bots.ts`: bot brain producing `PlayerInput` from world (seek pickups, kite mobs, fight, avoid fog, switch letters, use CAPITAL).
2. `src/input/keyboard.ts`: arrow keys -> mx/my, A-Z -> switchTo, Shift -> capital (edge), Tab -> minimap toggle (UI flag, not sim).
3. Tests: bots stay out of fog, pick up letters, a full bot match ends (capped, use big-step helpers).
4. Checkpoint `M2: input and bots`.

## Milestones
1. Core logic + tests  [done]
2. Input + bots
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
