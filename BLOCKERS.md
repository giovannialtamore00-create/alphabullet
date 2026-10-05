# Blockers

## 1. Bot-only matches are shorter than the 10-15 min target (balance, low severity)
- **What:** in headless all-bot matches (seeds 1-3) the last bot survives to ~6-7.5 min, before the fog's late stages (closes at 11 min).
- **Repro:** run 8 bots with `botInputs` + `step` until `w.over` (see the M8 pacing notes in DECISIONS.md for the measuring loop; it must be time-capped).
- **Tried:** lower PvP damage, spread letter spawns, gentler mob ramp, weaker mob contact, wider kiting, fog-staged bot aggression (2-4 min -> 6-7.5 min). Lowering the mob caps (300 -> 200) gave little, so caps were restored to the spec values.
- **Hypotheses:** bots handle swarms poorly (they kite but rarely line up emitters on mob clusters), so mobs cause ~half of all damage mid-game. Humans will likely survive longer than bots, so real matches with people may already hit the target.
- **Help needed:** a few real playtests. If matches feel short, the easy knobs are in `src/sim/config.ts`: `mobSpawnRate`, `MOB_TIERS[*].dmg`, `PVP_DAMAGE_MUL`, `FOG_STAGES` waits.
- **Workaround in place:** none needed; the game is fully playable.
