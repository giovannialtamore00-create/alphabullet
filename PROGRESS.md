# Progress

## Current
- Milestone: 7 (multiplayer, PeerJS). Phase: build.
- M6 done: .github/workflows/deploy.yml, README.md (run/build/deploy steps, how to play, letter table generated from glyph data). Not deployed yet: user must push to GitHub and enable Pages (README steps).

## Next steps
1. src/net/protocol.ts: message types + compact snapshot encode/decode (quantized positions, entities near each client only). Unit tests for round-trip.
2. src/net/host.ts / client.ts on PeerJS: room code = peer id suffix; lobby with player list; host runs sim + bots, sends snapshots at 20 Hz; clients send inputs every tick, interpolate others, predict own movement.
3. Disconnects: client leaves -> removePlayer; host leaves -> clients see notice and return to menu. Human cap decision.
4. Enable Host/Join in menu, lobby screen, join-by-code screen. Update README, checkpoint M7.

## Milestones
1. Core logic + tests  [done]
2. Input + bots  [done]
3. Rendering + playable solo loop  [done]
4. Effects + audio  [done]
5. Screens + polish  [done]
6. Deploy + README (solo)  [done, push pending user]
7. Multiplayer (PeerJS)
8. Parking-lot phase

## Context for a fresh session
- Spec: docs/design.md. Workflow: docs/workflow.md.
- Commands: `npm test`, `npm run build`, `npm run dev`.
- Test runs are capped at 500 ticks; long timers (fog, refill) are tested by calling `updateFog`/`updateWave` with large dt.
- Players are indexed by id (`w.players[id]`); copies by id (`w.copies[id]`).
- Do not put backticks inside double-quoted shell strings (bash executes them). Use the Write/Edit tools for markdown.
