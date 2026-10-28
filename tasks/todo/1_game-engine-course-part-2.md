# Course: build a game engine, part 2 (chapters 5–8)

**Area:** content repo (`fixedstep-content/courses/game-engine/`); no platform changes.
**Depends on:** `game-engine-course` (chapters 1–4; its content PR should merge first, or this
branch stacks on it).
**Origin:** split out of `game-engine-course` (user decision, 2026-10-27).

## Goal

Finish the `game-engine` course with chapters 5–8: input, physics, scenes and a capstone. The
plan in `tasks/in-progress/game-engine-course.md` (or `complete/`) applies unchanged:
**Conventions**, **Odin snippets: compile check**, **Checks** and **Risks**. The lesson outline
below was agreed with part 1.

## Lessons

- **Ch 5 `input`:**
  - `input-to-actions` (reading). Tabs: raylib `IsKeyDown` / `IsKeyPressed`, and the Odin
    enumerated array `[Action]bool`.
  - `action-map` (code). `updateActions(prev, keys, bindings): Record<Action, {down, pressed, released}>`.
    Tests: edges last exactly one frame; any bound key holds the action; `x`/`X`.
  - `jump-buffer` (sim). Jump buffering and coyote time on a flat platformer. Tests use
    `simulate` with scripted input: an early press within the buffer jumps, a press outside it
    doesn't, a jump within the coyote window works, and holding the key doesn't re-jump.
  - `input-quiz` (quiz).
- **Ch 6 `physics`:**
  - `collision-pipeline` (reading). Tabs: an AABB with an overlap test and `rl.CheckCollisionRecs`,
    and semi-implicit Euler.
  - `aabb-resolve` (code). `overlaps`, plus `penetration(a, b) → {x, y} | null` along the
    minimum axis. Hidden test: applying the vector separates the boxes.
  - `broadphase-pairs` (code). `findPairs(boxes, cellSize): [number, number][]`, unique and
    `i < j`. Tests compare against brute force and use a counter to cap the narrow-phase calls.
    Reuses `game-algorithms/spatial-hash`.
  - `tile-collision` (sim). Axis-separated move-and-slide on a tilemap with gravity. Tests:
    lands exactly on the floor, slides along walls, and never ends inside a solid tile over
    random runs.
  - `physics-quiz` (quiz).
- **Ch 7 `scenes`:**
  - `assets-and-scenes` (reading). Tabs: an asset cache as `map[string]Texture`, and scenes as
    an Odin `union` with a `switch`.
  - `asset-cache` (code). Refcounted `load(path)` / `release(h)` over an injected
    `loader` / `unloader`. Tests: the loader runs once per path, unload happens at refcount 0,
    and stale handles fail.
  - `scene-format` (code). `parseScene(text)` / `serializeScene(scene)` for a small JSON
    format. Tests: round-trip, defaults, and `toThrow` on an unknown component.
  - `scene-stack` (sim). Title, play and pause (on `p` / `P`): only the top scene updates, and
    every scene renders.
  - `scenes-quiz` (quiz).
- **Ch 8 `capstone`:**
  - `putting-it-together` (reading). One Odin tab with the full `main.odin` skeleton, as the
    native reference.
  - `capstone` (sim). A single-screen "collect the coins, dodge the enemies" game. The starter
    bundles the earlier pieces; the learner wires the system order and the scene switches.
    Tests: a coin raises the score, touching an enemy goes to game over, the restart action
    resets, and the run is deterministic under the seeded `random()`.

## Lessons from part 1's review

- Every behaviour a visible test checks must be in the lesson's assignment (or the starter's
  TODOs). Part 1 had a test needing an `alive` set the spec never mentioned.
- Hints and `code`-lesson bodies describe comparators and formulas in prose, not as the answer
  one-liner. Odin tabs may show the full native version (accepted by the user).
- Vary quiz answer positions; don't let one option letter win most questions.
- The content repo's default branch is `main`; open the content PR against it.

## Acceptance criteria

- [ ] Chapters `input`, `physics`, `scenes` and `capstone` in `courses/game-engine/`, listed in
      the course and matching the outline above; the course stays `published: false`.
- [ ] Every `code`/`sim` lesson has a `solution.ts` that passes its tests; validate passes
      with no "starter already passes" warnings.
- [ ] Each reading lesson has TS/Odin snippet tabs; every Odin tab has a wrapper in `odin/`
      and `node odin/check.mjs` passes.
- [ ] Manually played through in `pnpm content:dev`, at desktop and phone width (whole course).
