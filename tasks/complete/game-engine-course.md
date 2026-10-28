# Course: build a game engine from scratch

**Area:** content repo (`fixedstep-content/courses/game-engine/`); platform changes only if a
follow-up below is picked up.
**Depends on:** nothing. Builds on `2d-fundamentals`, `game-math` and `game-algorithms`.
**Origin:** user request (2026-10-27). Decision: exercises stay in TypeScript (the grader and
`sim` preview only run TS); Odin is shown alongside as the "native" version.

## Goal

A course where the learner builds a small 2D engine piece by piece. Graded `code`/`sim` lessons
are TypeScript; each lesson body shows the same idea in Odin with snippet tabs
(`` ```ts group=x `` followed by `` ```odin group=x ``), which already render as
"TypeScript" / "Odin" tabs (`apps/web/src/components/Markdown.tsx`). The Odin side is the
reference for learners who want to rebuild the engine natively (Odin + raylib/SDL), and is
not graded.

## Suggested outline

Chapters below are a starting point for the designer; adjust to fit the 320×240 `sim` canvas.

1. **Engine architecture**: what an engine is vs. a game; frame, fixed-step update, render;
   how this course's code maps to an Odin `main` loop (reading + quiz).
2. **Memory and data layout**: arenas/pools, structs of arrays vs. arrays of structs, handles
   instead of pointers (Odin's allocators shown in tabs; TS exercises on typed arrays and
   generational handles).
3. **Entities**: from a flat entity struct to a minimal ECS (component storage, queries,
   systems); `code` lessons graded on behaviour.
4. **Rendering**: sprite batching and draw ordering, a camera transform (reuses `game-math`
   matrices), tilemaps; `sim` lessons on the 2D canvas.
5. **Input and actions**: key state → action mapping, pressed/released edges, input buffering.
6. **Physics and collision**: AABB, broadphase with a spatial grid (reuses `game-algorithms`),
   resolution, fixed-timestep integration.
7. **Assets and scenes**: resource handles and caching, scene loading/switching, a simple
   serialized scene format.
8. **Capstone**: assemble the pieces into a small playable game in one `sim`.

Each chapter: a reading lesson, one or two `code` lessons (graded logic), and a `sim` where it
makes sense. Odin tabs in every reading lesson, and in code lessons where the Odin version
differs in an instructive way (allocators, `distinct` types, `#soa`).

## Platform limits to design around

The `sim` runtime (`apps/web/src/workers/preview.worker.ts`) owns the loop and calls the
learner's `init` / `update(state, dt, input)` / `render(ctx, state)`, with:

- a fixed 320×240 `OffscreenCanvasRenderingContext2D` (no WebGL);
- keyboard state only (no mouse, no gamepad), no audio, no asset loading.

So "write your own game loop" is taught in reading lessons and Odin tabs, and graded as
`code` lessons (e.g. an accumulator function under test), not by replacing the platform loop.

## Possible platform follow-ups (separate tasks if wanted; not part of this one)

- Mouse input in `sim` (position and buttons in `input`).
- Per-lesson canvas size.
- Bundled sprite/tile assets for `sim` lessons.
- Odin syntax highlighting in snippet tabs (tabs are plain `<pre>` today for every language).

## Acceptance criteria

Part 1 (chapters 1–4) only; chapters 5–8 moved to task `game-engine-course-part-2`.

- [x] `courses/game-engine/` in the content repo with `course.yaml` (`published: false` until
      reviewed) and the agreed chapters.
- [x] Every `code`/`sim` lesson has a `solution.ts` that passes its tests;
      `pnpm content:validate` passes.
- [x] Each reading lesson has TS/Odin snippet tabs for its key code; Odin snippets compile
      with the current Odin release (checked locally; not graded). 17 wrappers under the
      content repo's `odin/`, `node odin/check.mjs` all ok with `dev-2026-10:84bc3fc21`.
- [x] Manually played through in `pnpm content:dev`, at desktop and phone width (user,
      2026-10-28, whole course). Published to staging (#8) and prod (`v0.3.0.1`).

Content PR: `fixedstep/fixedstep-content` branch `game-engine-course` → `main` (the content
repo's default branch is `main`, not `content` as the plan below says). Reviewer approved
`5afc717` in round 2 (round 1 on `893fe5e`: CHANGES_REQUESTED, fixed in `5afc717`).

## Plan

### Scope

**Decision (user, 2026-10-27): split.** This branch ships chapters 1–4. Chapters 5–8 go to a new
task `game-engine-course-part-2` (bucket 1), created when this task is finished.

The full outline comes to about 32 lessons, which is as much as the three existing courses put
together. That is too much for one implementer pass.

- **This branch (part 1): chapters 1–4** (architecture, memory, entities, rendering), 16
  lessons, 7 of them graded. All four criteria apply to these chapters. The course stays
  `published: false`, so shipping only part of it is safe.
- **Deferred to a follow-up task (part 2): chapters 5–8** (input, physics, scenes, capstone),
  designed below so the outline is agreed now. The lead should ask the user to create it, for
  example `game-engine-course-part-2`, in a bucket the user picks. Until part 2 lands, the
  first criterion ("the agreed chapters") and the playthrough cover chapters 1–4 only.
- If the user would rather keep it as one task, the fallback is to trim: drop the quizzes in
  chapters 3, 5 and 7 and the `scene-stack` sim. That still leaves about 27 lessons, which is
  over budget.

No platform changes. `PLATFORM_REF` (999a91d) already renders `odin` tabs, so the content
repo's `publish.yml` stays as it is.

**Git:** the lessons go into the content repo (`/home/timish/source/fixedstep-content`, default
branch `content`) on its own `game-engine-course` branch and PR, which its CI validates. The
platform branch only carries this task file. The reviewer needs to be pointed at the
content-repo diff.

### Conventions (match the existing courses)

- Layout: `courses/game-engine/course.yaml`, then `<chapter>/chapter.yaml`, then
  `<lesson>/{lesson.md, starter.ts, tests.ts, tests.hidden.ts, solution.ts, hints.md}`.
  Scaffold each lesson with
  `node_modules/.bin/tsx packages/content-cli/src/cli.ts new game-engine/<chapter>/<lesson> <kind>`
  (run from the platform root with `CONTENT_DIR=../fixedstep-content`), or copy an existing
  lesson.
- `course.yaml`: `slug: game-engine`, `title: Build a 2D Game Engine`, `position: 3`,
  `published: false`, plus a description in the same style as the other courses ("…, built
  from scratch in TypeScript, with Odin alongside.").
- Frontmatter: reading lessons get `access: free, xp: 5`, quizzes `xp: 10`, code lessons
  `xp: 15`, sim lessons `xp: 25`. All of chapter 1 is `free`; everything else is `paid`.
- Lesson bodies follow the existing pattern: the idea, a pseudocode or TS/Odin tab group, "how
  real engines do it", then `## Assignment` (code/sim lessons only). Tabs are
  `` ```ts group=<name> `` immediately followed by `` ```odin group=<name> `` with nothing but
  blank lines between them (`splitLessonMarkdown`).
- Tests: `import { expect, random, simulate, test } from "@fixedstep/harness"` and
  `import … from "./solution"`. Visible tests cover the named cases. `tests.hidden.ts` holds
  one randomized test against a brute-force or `Map` model, seeded through `random()`. Add a
  `{ hint }` to tests where there is a "usual mistake", and never put inputs or expected
  values in it.
- Runtime limits: the grader allows 3 s (2 s inline in the API). Validate allows 5 s, so a
  lesson can pass validate and still time out in production. Keep each lesson's tests well
  under 1 s: few hundred iterations and `simulate` runs of at most about 600 steps.
- The starter must fail at least one visible test. Validate only warns on this, but treat the
  warning as an error.
- Sim lessons export `WIDTH = 320`, `HEIGHT = 240`, `init`, `update(state, dt, input)` and
  `render`. Keys arrive as `KeyboardEvent.key` values (`"ArrowLeft"`, `" "`), and letter keys
  change case with Shift, so bind both `"x"` and `"X"`. Don't use `Escape`, because the lesson
  drawer uses it on phones. Key repeat only re-sends "down", so the key state stays correct.
- `hints.md`: 2–3 hints per code/sim lesson, from a nudge to a near-answer, never the solution
  code (README "Hints"). This is optional but cheap, so do it in the same pass.

### Part 1 lessons (this branch)

**Ch 1 `architecture`: "Engine architecture"**

1. `engine-vs-game` (reading, free). Covers the layers (platform, loop, systems, game code)
   and what this course builds versus what the platform provides. Tabs:
   - `loop`: this platform's `init`/`update`/`render` in TS, next to an Odin
     `main :: proc()` using `vendor:raylib` with `InitWindow` and a `for !rl.WindowShouldClose()`
     loop.
   - `fixed`: the accumulator loop in TS pseudocode and in Odin.
2. `fixed-step-clock` (code, free). The learner writes
   `advance(clock: Clock, frameSeconds: number): { clock: Clock; steps: number; alpha: number }`,
   where `Clock = { acc: number; step: number; maxFrame: number }`. It clamps the frame time to
   `maxFrame`, counts the whole steps, keeps the remainder, and sets `alpha = acc / step`.
   - Visible tests: one exact step; 2.5 steps gives 2 steps, alpha 0.5 and the remainder
     carried over; a 1 s hitch is clamped; a frame of 0 gives 0 steps.
   - Hidden test: random frame times give a total step count of `floor(sum / step)` when
     nothing is clamped.
   - Body: an Odin tab showing `advance` in a raylib loop, which explains why the platform
     loop is graded this way.
3. `architecture-quiz` (quiz, free). 3–4 questions: what belongs in the engine and what in the
   game, why a fixed step, what alpha is for, and the spiral of death.

**Ch 2 `memory`: "Memory and data layout"**

4. `memory-and-layout` (reading). Covers GC churn, arenas and per-frame scratch memory,
   AoS versus SoA and cache lines, and handles instead of pointers. Tabs:
   - `arena`: TS "preallocate and reuse" next to Odin `virtual.Arena` / `context.allocator`.
   - `scratch`: TS scratch arrays reset each frame next to Odin `context.temp_allocator` with
     `free_all`.
   - `layout`: TS `{x, y}[]` versus one `Float32Array` per field, next to Odin `[]Particle`
     versus `#soa[]Particle`.
5. `particle-pool` (code). A fixed-capacity SoA pool:
   `class ParticlePool { constructor(capacity: number); count: number; x, y, vx, vy, life: Float32Array; spawn(x, y, vx, vy, life): number /* -1 if full */; update(dt: number): void }`.
   `update` integrates, decrements `life`, and swap-removes dead particles.
   - Visible tests: `spawn` returns `0, 1, …`; returns -1 when full; `update` moves by v·dt;
     dead particles are removed while survivors keep their data and stay packed in
     `[0, count)`; the arrays are the same instances after many updates (no reallocation).
   - Hidden test: random spawns and updates against an array-of-objects model, comparing the
     multisets of survivors.
6. `generational-handles` (code). The learner writes
   `class Slots<T> { insert(v: T): Handle; get(h: Handle): T | undefined; remove(h: Handle): boolean; size: number }`
   with `Handle = { index: number; generation: number }`, using a free list and bumping the
   generation on remove.
   - Visible tests: `get` after `insert`; `get` after `remove` is undefined; a stale handle
     can't read a new value in the reused slot; slots are reused, so the backing array doesn't
     grow; a second `remove` returns false.
   - Hidden test: random operations against a `Map` model.
   - Body: an Odin tab with `Handle :: struct { index, generation: u32 }` and
     `Entity :: distinct Handle`, explaining that `distinct` stops a texture handle from being
     passed where an entity handle is expected.
7. `memory-quiz` (quiz). Covers SoA benefits, why handles beat pointers or indices, arena
   lifetimes, and the cost of GC churn.

**Ch 3 `entities`: "Entities and ECS"**

8. `from-structs-to-ecs` (reading). Moves from a fat entity struct with flags to component
   stores, queries and systems. Tabs:
   - `fat`: a TS fat entity next to an Odin struct with `flags: bit_set[Entity_Flag]`.
   - `system`: a movement-system loop in TS and in Odin.
9. `sparse-set` (code). The learner writes
   `class SparseSet<T> { sparse: number[]; dense: number[] /* entity ids */; values: T[]; add(e, v); get(e): T | undefined; has(e): boolean; remove(e): boolean }`
   with swap-remove.
   - Visible tests: add, get and has; removing one entity keeps the others reachable;
     `dense.length === values.length` equals the live count; an entity can be re-added after
     removal; overwriting an existing entity's value doesn't duplicate it.
   - Hidden test: random operations against a `Map` model.
10. `world-and-queries` (code). The starter provides a working `SparseSet`. The learner writes
    `class World { spawn(): number; add<T>(e, component: string, v: T); get<T>(e, component); despawn(e); query(...components: string[]): number[] }`.
    `query` walks the smallest store and filters it by the others.
    - Visible tests: `query` returns exactly the entities that have every listed component
      (order-free); a despawned entity disappears from every query; `spawn` reuses ids only
      after `despawn`; a query over a component nobody has returns `[]`.
    - Hidden test: random worlds against a brute-force filter.
11. `systems` (sim). The starter has a `World` (with plain-object stores, so `JSON.stringify`
    in the worker snapshot works), a spawner that emits sparks, and the render code. The
    learner writes `movementSystem(w, dt)` (Position + Velocity), `gravitySystem` (only
    entities with a Gravity tag) and `lifetimeSystem` (despawn when `t <= 0`), and `update`
    runs them in order.
    - Visible tests: entities without Velocity stay still; only tagged entities fall; sparks
      despawn after their lifetime; the entity count stays bounded over 600 steps.
12. `entities-quiz` (quiz).

**Ch 4 `rendering`: "Rendering"**

13. `render-pipeline` (reading). Covers draw commands, sort keys, why batching matters (draw
    calls and state changes), cameras and culling. Tabs:
    - `command`: a TS `DrawCommand` next to an Odin struct sorted with `slice.sort_by`.
    - `camera`: a TS `ctx.translate` / `ctx.scale` camera next to Odin `rl.Camera2D` with
      `BeginMode2D`.
14. `draw-queue` (code). The learner writes
    `sortCommands(cmds: DrawCommand[]): DrawCommand[]` (by `layer`, then `y`, stable on
    submission order) and `batch(sorted): Batch[]`, which merges consecutive commands that
    share a `texture`. `DrawCommand = { layer, y, texture: string, id }`.
    - Visible tests: layer order, y-sort within a layer, stable ties, consecutive same-texture
      commands merged, no merging across a different texture in between, the input not
      mutated.
    - Hidden test: random commands, where flattening the batches equals a reference stable
      sort and the batch count equals the number of texture runs.
15. `camera-follow` (sim). The world is 40×30 tiles of 16 px (640×480); the starter provides
    the tilemap, a player moved by the arrow keys, and the render code. The learner writes:
    - `updateCamera(cam, target, dt)`: smooth follow with
      `cam += (target - cam) * min(1, FOLLOW * dt)`, clamped so the view never leaves the
      world;
    - `worldToScreen(cam, p)`;
    - `visibleTiles(cam): { x0, y0, x1, y1 }` for culling, which `render` uses.

    Visible tests: the camera centre maps to (160, 120); the camera clamps at the world's
    corners; it converges on a still player; holding ArrowRight via `simulate` moves the
    camera right; the visible tile range covers the screen and stays at most 21×16 tiles.
    Reuses the translate idea from `game-math`.
16. `rendering-quiz` (quiz).

### Part 2 lessons (follow-up task, same conventions)

Moved to task `game-engine-course-part-2`; kept here as the record of what was agreed.

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
  - `scene-stack` (sim). Title, play and pause (on `p`): only the top scene updates, and every
    scene renders.
  - `scenes-quiz` (quiz).
- **Ch 8 `capstone`:**
  - `putting-it-together` (reading). One Odin tab with the full `main.odin` skeleton, as the
    native reference.
  - `capstone` (sim). A single-screen "collect the coins, dodge the enemies" game. The starter
    bundles the earlier pieces; the learner wires the system order and the scene switches.
    Tests: a coin raises the score, touching an enemy goes to game over, the restart action
    resets, and the run is deterministic under the seeded `random()`.

### Odin snippets: compile check

`odin` is installed at `/usr/bin/odin` (`odin version dev-2026-10:84bc3fc21`) and runs in the
sandbox.

Method: snippets are fragments, so wrap each tab group's Odin code verbatim in a scratch
package: `<scratchpad>/odin/<lesson-slug>/main.odin` holds `package main`, the needed
`import`s, stub declarations, and the snippet between `// snippet <group>` markers. Then run
`odin check <dir>`, adding `-no-entry-point` when there's no `main`. `odin check` type-checks
without linking, so `vendor:raylib` needs no system raylib. Use only stable APIs: `core:mem`,
`core:mem/virtual`, `core:slice`, `#soa`, `distinct`, `bit_set`, and enumerated arrays.
Avoid `core:os` file I/O, which is being reworked (os2). Record the Odin version that was used
in the content PR description.

Optional: commit these wrappers in the content repo (e.g. `odin/` at the root, never under
`courses/`, because the loader expects every directory there to have a `course.yaml`) so later
edits can be rechecked. Leave this out unless the lead wants it.

### Order of work

1. `course.yaml` and chapter 1. Run `validate` once to confirm the course loads.
2. Chapters 2, 3 and 4, one lesson at a time. For each lesson: `solution.ts`, then
   `tests.ts`/`tests.hidden.ts`, then `starter.ts` (derived from the solution), then
   `lesson.md`, then `hints.md`.
3. Odin wrappers and `odin check` for every Odin tab.
4. Checks (below), then a manual pass in `content:dev` at desktop and phone width. On phones
   there's no keyboard, so check that the sims render and the layout holds; playing them on a
   phone isn't possible.

### Checks

From the platform root, in the sandbox:

- validate:
  `node_modules/.bin/tsx packages/content-cli/src/cli.ts validate /home/timish/source/fixedstep-content`
  must report no errors, and no "starter already passes" warnings for game-engine.
- type-check the content: `node_modules/.bin/tsc -p /home/timish/source/fixedstep-content --noEmit`.
- no platform code changes, so the platform's lint, typecheck and test commands only need a
  sanity run: `node_modules/.bin/biome check .`.
- the user runs `pnpm content:dev` themselves; it needs Docker and the database.

### Risks

- **Leaks:** `tests.ts` and `starter.ts` reach the browser. Solutions, hidden tests and hints
  stay in their server-only files. Starters must not contain the solution, and quiz
  `explanation`s must not repeat the answer text verbatim for other questions.
- **Grader time:** the hidden randomized tests must stay well under the 2–3 s production
  limits; validate's 5 s is looser.
- **Bundle size:** about 16 more lessons. That's fine today, but it moves the bundle toward
  the limits in `content-publish-limits`.
- **None of the CLAUDE.md code invariants apply:** XP, `harnessRuntime`, cloud SDKs and DTOs
  are untouched, because there are no platform changes.
