# Progress

## Current
- Milestone: 8 (parking-lot phase). Phase: parking lot.
- M7 done: src/net/ (protocol.ts snapshots, session.ts HostSession/ClientSession, transport.ts PeerJS + memory pair), src/ui/online.ts, Game client/host modes, main.ts online flows. 50 unit tests; e2e: smoke (2) + online (real PeerJS) pass.

## Next steps
1. BLOCKERS.md is empty: no parked problems. Use remaining time for small, safe improvements only on branches.
2. Final summary to user + final checkpoint.

## Milestones
1. Core logic + tests  [done]
2. Input + bots  [done]
3. Rendering + playable solo loop  [done]
4. Effects + audio  [done]
5. Screens + polish  [done]
6. Deploy + README (solo)  [done, push pending user]
7. Multiplayer (PeerJS)  [done]
8. Parking-lot phase

## Context for a fresh session
- Spec: docs/design.md. Workflow: docs/workflow.md.
- Commands: `npm test`, `npm run build`, `npm run dev`.
- Test runs are capped at 500 ticks; long timers (fog, refill) are tested by calling `updateFog`/`updateWave` with large dt.
- Players are indexed by id (`w.players[id]`); copies by id (`w.copies[id]`).
- Do not put backticks inside double-quoted shell strings (bash executes them). Use the Write/Edit tools for markdown.
