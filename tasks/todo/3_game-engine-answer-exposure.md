# Game engine course: decide how much of the graded answer lesson bodies may show

**Area:** content repo (`fixedstep-content/courses/game-engine/`); no platform changes.
**Depends on:** `game-engine-course` (part 1 content PR). Best done after
`game-engine-course-part-2`, so one pass covers every chapter.
**Origin:** reviewer finding, round 2 of `game-engine-course` (2026-10-28). The user kept the
text as it was for part 1 and asked for this follow-up.

## Problem

Round 1 of part 1's review removed the full `sortCommands` comparator from `draw-queue`'s
lesson body and hints and replaced it with prose. The same answer is still visible elsewhere:

- `rendering/render-pipeline/lesson.md` (the reading lesson just before `draw-queue`) shows
  `queue.sort((a, b) => a.layer - b.layer || a.y - b.y)`.
- Odin tabs in code lessons show the graded algorithm in full:
  - `memory/particle-pool/lesson.md`: the whole swap-remove `update` loop.
  - `rendering/draw-queue/lesson.md`: the whole run-batching loop.
- `capstone/putting-it-together/lesson.md` (part 2, the reading lesson just before the
  capstone): the full native `main.odin` includes `coin_system`, `hit_system` and the play-case
  system order, which is the capstone's graded logic. Part 2's plan allowed this one full Odin
  tab on purpose; the other part 2 Odin tabs show only code that isn't graded.
- Accepted at the time as spec rather than leaks: the clock loop in `fixed-step-clock`, the
  generation check in `generational-handles`, and `k = min(1, FOLLOW * dt)` in
  `camera-follow`.

The Odin tabs are meant to be the native reference for learners who rebuild the engine in
Odin, so cutting them has a cost. There is no consistent rule at the moment.

## Options

1. **Keep the Odin tabs full; keep the TS side in prose.** Write that rule down, and fix
   `render-pipeline`'s TS comparator.
2. **Show only the parts of each Odin tab that aren't graded** in code lessons, and put the
   full native version in reading lessons (e.g. `putting-it-together` in chapter 8).
3. **Collapse the Odin tab behind a "native version" spoiler**, if the platform supports
   one. This would need a platform change and a separate task.

## Acceptance criteria

- [ ] The user picks a policy, and it is written into the content repo's README (authoring
      notes) and the course tasks' conventions.
- [ ] Every `game-engine` lesson follows it; `odin/check.mjs` still passes for any changed
      Odin tab, and validate passes.
