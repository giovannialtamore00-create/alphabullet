# Alphabullet

Top-down 2D multiplayer bullet-hell arena where each player is a letter whose glyph shape is its gun.
Stack: Vite + TypeScript + PixiJS, Vitest, Playwright, PeerJS. Static site deployed to GitHub Pages.

## Docs (read only what the current task needs)
- [docs/design.md](docs/design.md): full game spec (rules, numbers, controls, presentation, milestones). Read the section for the system you are building.
- [docs/workflow.md](docs/workflow.md): autonomous-run rules (checkpoints, parking lot, resume steps). Read on resume or when blocked.
- [PROGRESS.md](PROGRESS.md): current milestone, done, next steps. Read FIRST on every resume.
- [DECISIONS.md](DECISIONS.md): every judgment call. Append, do not rewrite.
- [BLOCKERS.md](BLOCKERS.md): parked problems. Read when entering the parking-lot phase.

## Project rules (override global where they conflict)
- This project runs AUTONOMOUSLY after kickoff: do not stop between milestones or ask questions. Log choices in DECISIONS.md.
- Instead of "stop after 2 failed fixes": after ~3 different approaches, park the problem in BLOCKERS.md and move on.
- Still applies: cap every sim/game run (max 500 ticks or 10 s), test mechanics headless first, small reads/outputs.
- CHECKPOINT = update PROGRESS.md + `git commit`. Commit messages: `M<n>: <title>` at milestone end, `M<n> wip: <what>` mid-milestone.
- Patch/task loop (now that the MVP is done, this replaces the autonomous rule above): finish ONE task, wait for my approval and playtest, then `git commit` + save all info in PROGRESS.md, then ask me to /clear before starting the next patch or task.
- Core sim (`src/sim/`) has no DOM/Pixi imports. Glyph behavior comes from data in the glyph module, never hand-coded per letter.

## Commands (fill in as they are created)
- Dev: `npm run dev` · Build: `npm run build` · Unit tests: `npm test` · Smoke: `npm run test:e2e`

## Status
All milestones done. Patches: online guest smoothness (done), word powers (needs playtest + typing-vs-switch decision), balance patch + 12 new word powers (built, need playtest). Next steps in PROGRESS.md; see also BLOCKERS.md.
