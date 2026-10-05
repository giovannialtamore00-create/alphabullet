# Autonomous workflow rules

Source: kickoff prompt, process sections (verbatim).

You are building a complete, playable MVP of a game from scratch, in this empty folder.

## Kickoff phase (do this FIRST, before writing any game code)
I will be at the computer only during this kickoff phase. After that I will leave, and you must work autonomously to the end without waiting on me.

1. Read this whole prompt and make your plan: the milestones, every command you expect to run, and every tool or account you will need.
2. In ONE message, ask me up to 5 questions, and only questions whose answers would materially improve the result or save significant time. Examples: my OS, which tools are installed, which accounts I have and am logged into, and preferences that change architecture. Do not ask about anything this prompt already answers or that common sense covers. If you have no such questions, skip this step.
3. In the same message, list every permission you will need for the whole project: file edits, package manager commands, `git`, test and build commands, local servers, headless browsers, and deployment commands. Then set them up so you won't be blocked later. Write a project `.claude/settings.json` with `permissions.allow` rules covering exactly those, using the rule syntax your current Claude Code version supports, and ask me to approve it. Keep the rules scoped to this project's needs. Do not request broad system access, sudo, or anything touching files outside this folder.
4. Anything that needs my personal accounts or credentials (for example pushing to GitHub or logging into a hosting service or store) must either be completed during kickoff while I'm here, or be prepared fully and left as a single clearly documented final step for me. Never let it block the build.
5. After my answers and approvals, create PROGRESS.md (see "Checkpoints and resumability"), confirm in one line that you're starting, then work through all milestones without asking anything else.

After kickoff, never stop to ask me questions. Whenever something is unspecified, make the most sensible decision for a fun, clean, playable MVP. Use common sense, and look to how well-known games in the same genre handle it. Log every such decision in DECISIONS.md. If a command is unexpectedly blocked, find an alternative within your granted permissions, or log it and move on. If something turns out too heavy, simplify visuals before cutting mechanics.

## Handling hard problems (parking lot)
Don't brute-force a stubborn problem early on. If one problem has resisted about 3 genuinely different approaches, or roughly 20–30 minutes of effort, park it and move on.

1. Log it in BLOCKERS.md with:
   - what's wrong and how to reproduce it
   - what you tried and why each attempt failed
   - your best hypotheses
   - what help from me might unblock it
2. Keep the project moving around it. Use the simplest workaround, stub, mock or reduced version that lets later milestones proceed. Mark it with a `// BLOCKER:` comment and note it in BLOCKERS.md. Never let one parked problem stall everything after it.
3. Keep the main branch building and playable at all times.

After all milestones are complete, start a final phase: go back through BLOCKERS.md, highest gameplay impact first, and try again with fresh approaches while any session usage remains.
- Work on each blocker in its own git branch, and merge it only if the fix works and all tests and the build pass. Otherwise discard the branch so main stays clean.
- Timebox each blocker, so that one hard problem doesn't eat the time for the others.
- Update BLOCKERS.md with the result of each attempt.

## Checkpoints and resumability (session limits)
This build may be cut off at any moment by a usage limit, without warning, and resumed later in a fresh session with no memory of this one. You cannot see my usage meter, so treat every moment as possibly the last. Checkpoint often so a cutoff loses almost nothing.

A CHECKPOINT means: update PROGRESS.md, then `git commit` all work (on the current branch, with a clear message). PROGRESS.md must always contain:
- the current milestone and phase (including the parking-lot phase)
- what's done and what's in progress (exact files and functions)
- the exact next steps, in order
- any context a fresh session would need: decisions in flight, gotchas, commands that work

Do a checkpoint:
- at the end of every milestone
- at least once in the middle of every milestone, and roughly every 20–30 minutes of continuous work
- before any long, risky or wide-ranging change
- before and after each blocker attempt in the parking-lot phase
- immediately, as your top priority, if you see any sign the session may end: a usage or rate-limit warning, context compaction, or unusually long-running work
- as the very last thing you do, after the final summary is written

If you are resumed with a message like "continue":
1. Read PROGRESS.md, BLOCKERS.md, DECISIONS.md and `git log`.
2. Make sure you're on the right branch, and verify the build and tests still pass.
3. Carry on from the next step without asking me anything.
