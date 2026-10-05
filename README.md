# Alphabullet

A top-down bullet-hell arena where **you are a letter**. Your letter fires on its own from the free ends of its strokes, in the direction each stroke points. You never rotate, so you aim by moving. Up to 8 letters share one huge sheet of paper, with bots filling empty slots. Keyboard symbols (`! " £ $ % & / ( ) = # @ ? |`) swarm everyone. Collect letters, power them up to their CAPITAL form, and be the last letter standing.

Everything is original and drawn in code: every glyph is our own stroke path, the paper texture is procedural, and all music and sound effects are synthesized with Web Audio.

## Requirements
- To play: a desktop browser with WebGL (recent Chrome, Edge, Firefox or Safari) and a keyboard.
- To run the code: [Node.js](https://nodejs.org) 20 or newer (comes with npm).

## Run locally
```bash
npm install      # once
npm run dev      # starts the game at http://localhost:5173
```
Add `?debug` to the URL (http://localhost:5173/?debug) for the debug panel: god mode, give any letter, instant upgrade, spawn mobs, hitboxes/emitters/shield arcs, FPS and entity counts.

## Build for release
```bash
npm run build    # type-checks and writes the static site to dist/
npm run preview  # serves dist/ locally to check the release build
```

## Tests
```bash
npm test                          # unit tests (core rules, glyphs, bots)
npx playwright install chromium   # once
npm run test:e2e                  # headless browser smoke + full-flow test
```

## Deploy to GitHub Pages (step by step)
The repo includes `.github/workflows/deploy.yml`. It tests, builds and publishes the game every time you push to `main`.

1. **Create a GitHub account** at https://github.com if you don't have one.
2. **Create an empty repository:** click **+** (top right), then **New repository**. Name it `alphabullet`, keep it **Public**, and do *not* add a README, .gitignore or license. Click **Create repository**.
3. **Push this folder.** Open a terminal in this project folder and run (replace `YOUR-NAME`):
   ```bash
   git remote add origin https://github.com/YOUR-NAME/alphabullet.git
   git push -u origin main
   ```
   If asked to log in, follow the browser prompt. Alternatively, run `gh auth login` first if you have the GitHub CLI.
4. **Turn on Pages:** in the repository go to **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
5. **Wait for the build:** open the **Actions** tab. The "Deploy to GitHub Pages" run takes about 1–2 minutes. If it ran before Pages was enabled and failed, click it and choose **Re-run all jobs**.
6. **Play:** your game is at `https://YOUR-NAME.github.io/alphabullet/`. The link is also shown on the finished run and in **Settings → Pages**.

Every later `git push` redeploys automatically.

## How to play
| Key | Action |
|---|---|
| Arrow keys | Move (8 directions) |
| A–Z | Switch to that letter, if you own it (0.5 s cooldown) |
| Shift | CAPITAL power of the active letter (once it is upgraded) |
| Tab | Toggle the minimap |
| Esc | Pause (solo) / settings menu |

**Rules**
- Each player starts with 2 random letters. 8 more lie glowing on the map. Walk over one to pick it up. You can't hold two copies of the same letter, and only 2 copies of each letter exist.
- When half of the map letters are taken, a 2-minute timer starts, then new letters appear in fresh spots (shown on the minimap).
- Your active letter fires constantly. Letters with more stroke ends fire more, weaker bullets.
- Damage and kills give XP to the letter you are using. When it's full, the letter is **upgraded**: press **Shift** to become its CAPITAL form for 20 s (new shape, new firing pattern, bigger bullets). Then it recharges for 45 s.
- **Shield letters** (O, D, B, C, Q) block damage on their curved side, up to a cap per second. O guards all round but blocks less; D and B guard one side but block more. Damage over the cap still gets through.
- Mobs only hurt by touching you. Mobs and players both block bullets.
- The **fog** closes in in stages (the next safe zone is the dashed circle). Standing in it hurts.
- When a player is erased, their letters drop nearby, *keeping their upgrades*. Death is final: you then spectate. **The last letter standing wins.**

## Letters
Firing directions are derived automatically from each glyph's strokes (N = up, S = down, E = right, W = left). "Pulses" means the letter has no free stroke ends, so it fires weak pulses from its curves.

| Letter | lowercase fires | CAPITAL fires | Shield cap (lower → CAP) | Notes |
|---|---|---|---|---|
| A | N S | S S | - | Two legs fire straight down. |
| B | N S | E E (pulses) | 30/s → 52/s | Shield letter: double bowl guards the right side. |
| C | E E | E E | 25/s → 44/s | Shield letter: guards the back, fires out of its opening. |
| D | N S | E (pulses) | 30/s → 52/s | Shield letter: strong one-sided shield on its curve. |
| E | E | E E E | - | All prongs fire right. |
| F | S E W E | E S E | - | Fires right from its arms and down from its stem. |
| G | N W | E W | - | Hook fires right, spur fires left. |
| H | N S S | N S N S | - | Two posts fire up and down. |
| I | S N | W E W E | - | Lowercase: dot fires up, foot fires down. Capital serifs fire sideways. |
| J | W N | N NW | - | Fires up from the top and back from its hook. |
| K | N S NE SE | N S NE SE | - | Stem fires up/down, arms fire diagonally right. |
| L | N S | N E | - | Lowercase: up and down. Capital: up and right. |
| M | N S S S | S S | - | Lowercase: fork of three feet firing down. Capital: two wide legs down. |
| N | N S S | S N | - | Fires down on one side, up on the other. |
| O | E S W N (pulses) | E S W N (pulses) | 20/s → 35/s | Shield letter: all-round shield, weak pulses in four directions. |
| P | N S | S | - | Lowercase: up and down. Capital: one heavy shot down. |
| Q | N S | SE | 30/s → 35/s | Shield letter: all-round shield plus a tail shot. |
| R | N S E | S SE | - | Fires down and from its arm or leg. |
| S | E W | E W | - | Fires right from the top and left from the bottom. |
| T | N E W E | W E S | - | Arms fire sideways, stem fires down. |
| U | N N S | N N | - | Cup fires upward. |
| V | NW NE | NW NE | - | Fires diagonally up-left and up-right. |
| W | N N | N N | - | Two outer arms fire up. |
| X | NW SE NE SW | NW SE NE SW | - | Four diagonal ends fire diagonally. |
| Y | NW NE SW | NW NE S | - | Arms fire diagonally up, tail fires down. |
| Z | W E | W E | - | Top fires left, bottom fires right. |

## Project layout
- `src/sim/`: pure, deterministic game logic (no DOM). `glyphs.ts` holds every letter and symbol as stroke paths; `glyphDerive.ts` derives emitters, shields and bullet stats from them.
- `src/render/`: PixiJS renderer, effects and procedural textures. `src/ui/`: HUD and screens. `src/audio/`: Web Audio synth. `src/game/`: match loop.
- `DECISIONS.md` lists every judgment call. `BLOCKERS.md` lists parked problems. `PROGRESS.md` holds the current status.

## Known limitations
- Online play arrives in the multiplayer milestone. Until then Host and Join are disabled.
- Keyboard only; no touch or mobile controls (by design for this MVP).
- Balance numbers are first-pass guesses (see `DECISIONS.md`).
- Bots are simple steering AIs: they collect letters, kite mobs, aim by moving, avoid fog and use CAPITAL, but they don't plan.
