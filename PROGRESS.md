# Progress

## Current
- Milestone: 6 (deploy + README for solo). Phase: build.
- M5 done: src/ui/screens.ts (menu, settings, pause, end, notice), main.ts state machine. e2e: tests/e2e/smoke.spec.ts (2 tests: load+match, full flow) pass.

## Next steps
1. .github/workflows/deploy.yml (build + test + deploy to GitHub Pages).
2. README.md: run, build, deploy steps for a non-expert, how to play, requirements, known limitations, letter content table (generated from data via scripts/letterTable).
3. Checkpoint M6.

## Milestones
1. Core logic + tests  [done]
2. Input + bots  [done]
3. Rendering + playable solo loop  [done]
4. Effects + audio  [done]
5. Screens + polish  [done]
6. Deploy + README (solo)
7. Multiplayer (PeerJS)
8. Parking-lot phase

## Context for a fresh session
- Spec: docs/design.md. Workflow: docs/workflow.md.
- Commands: `npm test`, `npm run build`, `npm run dev`.
- Test runs are capped at 500 ticks; long timers (fog, refill) are tested by calling `updateFog`/`updateWave` with large dt.
- Players are indexed by id (`w.players[id]`); copies by id (`w.copies[id]`).
- Do not put backticks inside double-quoted shell strings (bash executes them). Use the Write/Edit tools for markdown.
