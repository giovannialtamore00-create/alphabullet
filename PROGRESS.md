# Progress

## Current
- Milestone: 5 (screens + polish). Phase: build.
- M4 done: src/render/effects.ts (particles, rings, shield ripples), src/audio/audio.ts (AudioEngine singleton audio: music scheduler + SFX), src/game/feedback.ts (attachFeedback wires events to fx+audio). Game has onFrame/onEvents hooks.

## Next steps
1. src/ui/screens.ts: start screen (Play vs bots / Host / Join / Settings; online buttons marked coming soon until M7), settings (music, sfx sliders, mute), pause/settings overlay (Esc), end screen (winner, placement, kills, letters collected, Play again / Back to menu).
2. main.ts: app state machine menu -> match -> end -> menu. Title drawn with our glyphs.
3. Polish pass: how-to-play panel on start screen, playtest headless a full flow in Playwright (start -> match -> force end -> end screen -> back).
4. Checkpoint M5.

## Milestones
1. Core logic + tests  [done]
2. Input + bots  [done]
3. Rendering + playable solo loop  [done]
4. Effects + audio  [done]
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
