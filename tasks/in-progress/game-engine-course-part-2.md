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

## Plan

### Scope

- **This branch:** chapters 5–8 as outlined: 16 lessons, 9 of them graded. Criteria 1–3 are
  fully covered.
- **Deferred:** criterion 4 (the manual playthrough). The user does it in `content:dev`, as in
  part 1.
- No platform changes. **Git:** the lessons go in the content repo
  (`/home/timish/source/fixedstep-content`) on branch `game-engine-course-part-2`, stacked on
  `game-engine-course`. The PR targets `main`; retarget or rebase it once part 1 merges (the
  lead or the user does this). The platform branch carries only this task file, so point the
  reviewer at the content-repo diff.
- **Reuse by reference:** part 1's **Conventions**, **Odin snippets: compile check** (wrappers
  in `odin/<lesson>/<group>/main.odin`, checked with `node odin/check.mjs`), **Checks** and
  **Risks** in `tasks/in-progress/game-engine-course.md` apply unchanged. That includes the
  frontmatter values: reading `paid, xp: 5`, quiz `xp: 10`, code `xp: 15`, sim `xp: 25`. Every
  lesson here is `paid`.
- **Answer exposure (current practice, pending `game-engine-answer-exposure`):** graded logic
  is described in prose on the TS side of bodies and in hints. Odin tabs here only show parts
  that aren't graded (bindings, grid keys, the cache, unions). The one exception is the full
  native `main.odin` in `putting-it-together`.

### Platform fit: adaptations

- **Input arrives as snapshots.** `input.keys` is a snapshot per step, and keyup leaves a
  `false` entry behind, so "held" means `keys[k] === true`. A tap that is shorter than one step
  can be missed entirely. Say this in `input-to-actions`; the quiz asks about it.
- **Edges come from state.** Pressed and released edges are derived from the previous step's
  state. Sims that need them keep `actions` in their state and reuse a provided copy of
  `updateActions`, the way part 1 reused `SparseSet`.
- **No assets.** `asset-cache` uses an injected fake `loader`/`unloader`. `scene-format`
  parses a string. Both lesson bodies say why: the injected functions are also how you'd test
  this code in a real engine.
- **Pause uses `p`/`P`, not Escape.** Every letter binding lists both cases.
- **Fitting the canvas.** `tile-collision` uses a 20×15 map of 16 px tiles, which is exactly
  320×240. The capstone is a single screen.
- **Capstone determinism.** The harness `random()`/`Math.random` is one stream per run, so two
  `simulate` runs in one test draw different numbers. In the browser preview it isn't seeded at
  all. So the capstone keeps its own mulberry32 seed in `state.rng` (a provided
  `rand(s)`), and the test runs twice from `newGame(seed)` and compares the results with
  `toEqual`. That test also catches a learner who calls `Math.random`.
- **Plain-data state.** All sim state stays plain data (no `Map`, `Set` or classes), because
  the worker JSON-snapshots `init()` on reload.

### Ch 5 `input`: "Input and actions"

1. **`input-to-actions`** (reading). Covers why games use actions instead of keys
   (rebinding, several keys per action), down/pressed/released shown as a frame table in
   prose, polling vs. events, and fixed step vs. per-frame edges: raylib's `IsKeyPressed` is
   per render frame, so with two updates in one frame it's seen twice, or missed when a frame
   has zero updates. Also why `KeyboardEvent.key` changes with Shift while raylib key codes
   don't. Tabs:
   - `poll`: TS reading `input.keys.ArrowLeft === true` and keeping `prevKeys` in state,
     next to Odin `rl.IsKeyDown(.LEFT)`, `rl.IsKeyPressed(.SPACE)` and `rl.IsKeyReleased`.
   - `actions`: TS `type Action = "left" | …` with a `Record<Action, boolean>`, next to Odin
     `Action :: enum { Left, Right, Jump, Fire }`, `down: [Action]bool` and a
     `[Action]rl.KeyboardKey` binding table filled in a loop.
2. **`action-map`** (code).
   ```ts
   export type Action = "left" | "right" | "jump" | "fire";
   export const ACTIONS: Action[];
   export type ActionState = { down: boolean; pressed: boolean; released: boolean };
   export type ActionStates = Record<Action, ActionState>;
   export type Bindings = Record<Action, string[]>;
   export const DEFAULT_BINDINGS: Bindings; // left: ArrowLeft a A, right: ArrowRight d D, jump: " " ArrowUp w W, fire: x X
   export function emptyActions(): ActionStates; // provided
   export function updateActions(prev: ActionStates, keys: Record<string, boolean>, bindings: Bindings): ActionStates;
   ```
   - **Starter:** `emptyActions` is provided. `DEFAULT_BINDINGS.fire` is `["x"]` with a TODO
     ("Shift turns this into X"). `updateActions` returns `emptyActions()`.
   - **Assignment states:** an action is down if any of its keys is `true` (a `false` entry
     means up); `pressed` and `released` are true only on the step where `down` changes; the
     result has every action; `prev` isn't mutated; fire works with and without Shift.
   - **Visible tests:**
     - pressed is `[T, F, F]` over three held steps;
     - released is true for exactly one step;
     - a second bound key keeps the action held with no new edge when the first key is
       released;
     - `{ X: true }` fires with `DEFAULT_BINDINGS`;
     - an unbound key and a `false` entry do nothing;
     - custom bindings are respected;
     - `prev` is unchanged.
   - **Hidden test:** 200 steps of random key snapshots against a model: `down` matches "any
     bound key true", and edges match the `down` transitions.
   - **Hints:** compute `down` first, then compare it with `prev`; Shift and letter keys;
     build a fresh object.
   - **Optional tab** `bindings`: TS `Bindings`, next to Odin `[Action][]rl.KeyboardKey`. Key
     codes don't change with Shift.
3. **`jump-buffer`** (sim). A 320×240 platformer: floor top at y=216 across the screen, a
   ledge `{x:0, y:150, w:120}`, and a 12×16 player starting on the ledge. Provided:
   - constants `GRAVITY=900`, `JUMP_SPEED=300`, `RUN=120`, `BUFFER=0.1`, `COYOTE=0.1`;
   - `updateActions` (as in `action-map`, with jump on `" " ArrowUp w W`);
   - `physicsStep(s, dt)`, which lands on platform tops and sets `grounded`;
   - `doJump(s)`, which sets `vy = -JUMP_SPEED`, sets `grounded = false`, clears both timers
     and does `jumps += 1`;
   - `render`, with timer bars in the HUD.

   State is `{ x, y, vx, vy, grounded, coyote, buffer, jumps, actions }`. `update` runs, in
   order: actions, then `vx`, then `updateJump(s, dt)` (the TODO), then `physicsStep`.

   The learner writes `updateJump(s: State, dt: number): void`, as the assignment states:
   - if `grounded`, set `coyote = COYOTE`, otherwise subtract `dt`;
   - if `jump.pressed`, set `buffer = BUFFER`, otherwise subtract `dt`;
   - if both timers are > 0, call `doJump`.

   The starter jumps on `jump.down && grounded`, which re-jumps while the key is held and has
   no buffer or coyote time.
   - **Visible tests** (each ≤ 120 steps; find landing and leaving steps with a dry run first,
     so there are no magic frame numbers):
     - a press while grounded jumps on that step;
     - a press 3 steps before landing jumps on the landing step;
     - a press 15 steps before landing doesn't jump;
     - walking off the ledge (start at x=110 and hold right) and pressing 3 steps after
       leaving jumps;
     - pressing 15 steps after leaving doesn't jump;
     - holding jump for 120 steps from the ground gives `jumps === 1`;
     - a buffered jump fires only once.
   - **Hidden test:** 3 runs × 300 steps of random taps and holds, stepping `update` by hand
     and checking invariants on every step where `jumps` goes up: there was a press within
     `BUFFER + 1e-9`, there was ground within `COYOTE + dt`, and there was a new press since
     the last jump. A grounded press always jumps.
   - **Hints:** use the edge, not `down`; one timer counts from the press and the other from
     the ground; check after both timers are updated.
   - **Tabs:** none.
4. **`input-quiz`** (quiz, 6 questions; `answer` indices in brackets):
   - why actions instead of keys [3];
   - how long `pressed` lasts [0];
   - what goes wrong reading `IsKeyPressed` in each of two fixed updates in one frame [2];
   - what a tap shorter than one step does with snapshot input [3];
   - what a jump buffer is for [1];
   - what coyote time forgives [0].

### Ch 6 `physics`: "Physics and collision"

5. **`collision-pipeline`** (reading). Covers the pipeline (integrate, then broadphase, then
   narrowphase, then resolve), AABBs stored as top-left + size, touching edges not counting as
   overlap (strict, like raylib), tunnelling and the per-step speed cap, and resolving the
   minimum axis vs. separating the axes. Tabs:
   - `aabb`: TS `type AABB = { x, y, w, h }` and a call site, with the overlap rule in prose;
     next to Odin `rl.Rectangle`, `rl.CheckCollisionRecs` and `rl.GetCollisionRec`.
   - `euler`: semi-implicit Euler in TS and in Odin with `[2]f32` (spec already taught in
     `systems`).
6. **`aabb-resolve`** (code).
   ```ts
   export type AABB = { x: number; y: number; w: number; h: number };
   export type Vec = { x: number; y: number };
   export function overlaps(a: AABB, b: AABB): boolean;           // strict: touching is false
   export function penetration(a: AABB, b: AABB): Vec | null;     // move `a` by this to separate
   ```
   - **Assignment states:**
     - the overlap on each axis is `min(right edges) - max(left edges)`;
     - push along the axis with the smaller overlap, with ties going to x;
     - the sign points from b's centre toward a's centre, and positive when the centres are
       level;
     - the other component is 0;
     - `null` when the boxes don't overlap;
     - inputs aren't mutated.
   - **Starter:** both functions are TODOs that return `false`/`null`.
   - **Visible tests:**
     - overlaps: overlapping, apart on x, apart on y, touching, containment;
     - null when apart or touching;
     - an overlap from the left of 2 px on x and 10 px on y gives `{x:-2, y:0}`;
     - a from below gives a positive y;
     - a tie resolves along x;
     - inputs are unchanged.
   - **Hidden test:** 500 random pairs with integer coordinates (so the arithmetic is exact):
     an overlapping pair has exactly one non-zero component equal to the smaller overlap, and
     `overlaps(a + p, b)` is false. A pair that doesn't overlap gives `null`.
   - **Hints:** the strict comparison; compute both overlaps first; compare centres for the
     sign.
7. **`broadphase-pairs`** (code). The starter provides a working `overlaps`.
   ```ts
   export function findPairs(boxes: AABB[], cellSize: number,
     narrow: (a: AABB, b: AABB) => boolean = overlaps): [number, number][];
   ```
   - **Assignment states:**
     - file each box index under every cell from `floor(x / cs)` to `floor((x + w) / cs)` on
       both axes, keyed like `game-algorithms/spatial-hash`;
     - candidates are index pairs that share a cell;
     - de-duplicate the candidates before calling `narrow`, which runs **once per candidate
       pair**;
     - return `[i, j]` with `i < j`, once each, in any order;
     - boxes that never share a cell are never passed to `narrow`.
   - **Starter:** the brute-force double loop (correct but calls `narrow` n² times).
   - **Visible tests:**
     - matches brute force on a hand-made scene (compare sorted);
     - two big boxes sharing 4+ cells give `[[0, 1]]` and exactly 1 `narrow` call;
     - a 10×10 lattice of separated boxes makes 0 calls;
     - touching boxes aren't a pair;
     - empty input and a single box give `[]`;
     - negative coordinates work (hint: `Math.floor`, not truncation).
   - **Hidden test:** 150 random boxes in 400×400, sizes 4–30, cell 32. The result equals
     brute force, no pair reaches `narrow` twice (track a `Set` of pairs), and the call count
     is under a cap. The implementer measures the actual count and sets the cap at about 3×
     it, far below the brute-force 11,175.
   - **Hints:** a `Map<string, number[]>` of cells; a key for the pair; sort `i, j`.
   - **Optional tab** `grid`: TS string cell keys, next to Odin `map[[2]i32][dynamic]int`
     (no string keys needed). This covers storage only, not pairing.
8. **`tile-collision`** (sim). Provided:
   - a 20×15 `TILES: string[]` map (`#` solid), with walls, a floor whose top is at row 13
     (y=208), two floating platforms, and a low ceiling to bump into;
   - `TILE = 16` and `solidAt(tx, ty)`, where out of bounds counts as solid;
   - `boxHitsSolid(b)`, which covers tiles from `floor(x/T)` to `ceil((x+w)/T) - 1`, so an
     edge lying on a tile boundary isn't inside that tile;
   - `updateActions` (left/right/jump, both letter cases);
   - gravity, with `vy` capped at 600 so a step moves < 1 tile;
   - `render`.

   The body is `{ x, y, w: 12, h: 14, vx, vy, grounded }`. `update` calls the learner's
   `moveAndSlide(b: Body, dx: number, dy: number): { hitX: boolean; hitY: boolean }`, then
   applies the result: on a hit it zeroes that axis's velocity, and it sets
   `grounded = hitY && dy > 0`.

   **Assignment states:** move x first. If the box now hits a solid tile, snap it flush:
   moving right puts the right edge on the left edge of the tile column it entered, and moving
   left goes the other way. Then do the same for y. It mutates `b`, and it may assume
   `|dx|, |dy| < TILE`. The snap formula is given in prose, not code. The starter adds `dx`
   and `dy` and never reports a hit.
   - **Visible tests:**
     - falling from the air for 120 steps lands with `y + h` being exactly `208` (`toBe`),
       `grounded`, and `vy === 0`;
     - moving right into a wall leaves the box flush with `hitX`;
     - moving left into a wall works the same way;
     - a diagonal move into a wall snaps x and moves y by the full `dy` (slides);
     - moving up into the ceiling snaps to the tile's bottom with `hitY`;
     - a free move gives exact `dx`/`dy` and no hits;
     - holding ArrowRight via `simulate` for 180 steps stops at the wall and never
       `boxHitsSolid`.
   - **Hidden test:** 4 runs × 240 steps of random left/right/jump holds, with
     `boxHitsSolid(body)` false after every step. Then 300 direct calls from random free
     positions with `|d| ≤ 15`: the box never ends in a solid tile, and an axis with no hit
     moved by exactly its delta.
   - **Hints:** one axis at a time; which tile column the moving edge is in; set `hitX`/`hitY`
     when you snap.
   - **Tabs:** none.
9. **`physics-quiz`** (quiz, 6 questions; `answer` indices in brackets):
   - what causes tunnelling [0];
   - why resolve x and y separately in a tilemap [3];
   - which axis minimum-axis resolution pushes along [1];
   - what a broadphase saves [3];
   - why a box spanning 4 cells needs de-duplication [2];
   - why semi-implicit beats explicit Euler [0].

### Ch 7 `scenes`: "Assets and scenes"

10. **`assets-and-scenes`** (reading). Covers handles over raw resources, caching and
    refcounts (a texture shared by two scenes), and why the platform has no files (the fake
    loader). It also covers scenes as states, a stack (pause over play), and data-driven scene
    files (designers, hot reload, versioning in prose). Tabs:
    - `cache`: TS usage only (`const h = assets.load("hero.png"); … assets.release(h)`), next
      to Odin `textures: map[string]rl.Texture2D` with a get-or-load proc
      (`strings.clone_to_cstring(path, context.temp_allocator)`, `rl.LoadTexture`) and an
      unload-all loop. This doesn't give away the graded refcounting.
    - `scenes`: a TS discriminated union with `switch (scene.kind)`, next to Odin
      `Scene :: union { Title, Play, Pause }` with `switch &s in scene`.
11. **`asset-cache`** (code). The starter provides a working `Slots<T>` from
    `generational-handles`.
    ```ts
    export type Handle = { index: number; generation: number };
    type Entry<T> = { path: string; asset: T; refs: number };
    export class AssetCache<T> {
      slots: Slots<Entry<T>>; byPath: Map<string, Handle>;
      constructor(loader: (path: string) => T, unloader: (asset: T) => void);
      load(path: string): Handle;   // cached: refs++ and the same handle; else loader once, refs = 1
      get(h: Handle): T | undefined;
      release(h: Handle): boolean;  // stale: false; refs--; at 0: unloader(asset), free the slot, forget the path
      refCount(path: string): number; // 0 if not loaded
    }
    ```
    - **Starter:** `load` always calls `loader` and inserts; `release` returns `false`.
    - **Visible tests:**
      - the same path twice makes one loader call and gives equal handles;
      - two paths make two calls with different handles;
      - `get` returns the asset;
      - with two loads, the first release doesn't unload (`refCount` is 1) and the second
        unloads exactly once with the asset;
      - after unload, `get` gives `undefined`, `release` gives `false`, and the unloader isn't
        called again;
      - loading again calls the loader again, and the old handle stays stale even though the
        slot is reused;
      - a stale handle can't release the slot's new asset.
    - **Hidden test:** 400 random load/release ops over 8 paths against a `Map<path, refs>`
      model with per-path loader and unloader call counts.
    - **Hints:** look up the path first; count down, and only unload at 0; `Slots` already
      makes stale handles fail.
12. **`scene-format`** (code).
    ```ts
    export type Vec = { x: number; y: number };
    export type Components = { position?: Vec; velocity?: Vec; sprite?: { color: string; size: number }; collider?: { w: number; h: number } };
    export type EntityDef = { name: string; components: Components };
    export type Scene = { name: string; entities: EntityDef[] };
    export const DEFAULTS: Required<Components>; // position/velocity {0,0}, sprite {"#ffffff", 8}, collider {16,16}; provided
    export function parseScene(text: string): Scene;
    export function serializeScene(scene: Scene): string;
    ```
    - **Assignment states:**
      - parse fills each present component as `{ ...DEFAULTS[name], ...value }` in a fresh
        object;
      - absent components stay absent;
      - `entities` defaults to `[]` and `components` to `{}`;
      - an unknown component name throws (bad JSON throws by itself);
      - serialize leaves out each field equal to its default, but keeps the component (as
        `{}` if every field is a default);
      - `parseScene(serializeScene(s))` equals `s`.
    - **Starter:** `parseScene = JSON.parse` and `serializeScene = JSON.stringify`. The
      round-trip test passes on the starter; the defaults and throw tests fail.
    - **Visible tests:**
      - a full scene keeps its values;
      - missing fields take defaults and absent components stay absent;
      - missing `entities`/`components` default;
      - `toThrow` on `"health"`;
      - mutating a parsed default doesn't affect the next parse;
      - serialize omits default fields (`sprite` with only `color`, `position` as `{}`);
      - round-trip.
    - **Hidden test:** 100 random scenes with random component subsets, where values sometimes
      equal the defaults. Each round-trips, and no serialized field equals its default.
    - **Hints:** loop over the component names and check each against `DEFAULTS`; spread into
      a new object; compare field by field when writing.
13. **`scene-stack`** (sim).
    - **Types:** `Scene = {kind:"title", t} | {kind:"play", t, ball:{x,y,vx,vy}} | {kind:"pause", t}`
      and `Transition = {push: Scene} | {pop: true} | {replace: Scene} | null`.
    - **Provided:**
      - `SCENES: { [K in Scene["kind"]]: SceneDef<…> }`, where each `SceneDef` has
        `update(scene, dt, actions): Transition` and `render(ctx, scene)`:
        - title clears the screen and draws text; `start.pressed` gives
          `{replace: newPlay()}`;
        - play clears the screen, bounces the ball and does `t += dt`; `pause.pressed`
          pushes pause;
        - pause draws a translucent overlay with "PAUSED"; `pause.pressed` pops;
      - `defOf(scene)`, which looks up `SCENES` at call time;
      - `updateActions` with `start: [" ", "Enter"]` and `pause: ["p", "P"]`;
      - `init()`, which returns `{ stack: [title], actions }`;
      - `update`, which runs actions, then `updateStack`.
    - **The learner writes** `updateStack(s: State, dt: number): void` and `render(ctx, s)`:
      - only the top scene's `update` runs, and its transition is applied (push, pop or
        replace), so there's at most one transition per step;
      - `render` calls `defOf(scene).render` for every scene from bottom to top and draws
        nothing itself.
    - **Starter:** updates every scene and applies the top's transition (so play keeps moving
      under pause), and renders only the top (so pause shows over black).
    - **Visible tests:**
      - Space and Enter both go from title to `["play"]`;
      - `p` and `P` both give `["play", "pause"]`;
      - while paused, 60 steps leave `play.t` and `ball` unchanged;
      - a second press pops, and play resumes;
      - holding `p` for 30 steps stays paused (one push);
      - with `SCENES.*.render` replaced by loggers (restored after), `render` logs
        `["play", "pause"]`.
    - **Hidden test:** 300 steps of random start and pause taps against a model of the stack
      kinds. `play.t` only advances on steps where play was on top.
    - **Hints:** `stack.at(-1)`; the transition kinds; render order.
    - **Tabs:** none (the reading covers the union).
14. **`scenes-quiz`** (quiz, 6 questions; `answer` indices in brackets):
    - why refcount instead of unloading on scene exit [2];
    - why `load` returns a handle, not the texture [0];
    - why pause updates only the top but renders all [3];
    - why scenes live in data files [1];
    - the cost of omitting defaults when a default later changes [3];
    - what Odin's `switch` on a union checks [0].

### Ch 8 `capstone`: "Capstone"

15. **`putting-it-together`** (reading). A table maps each chapter to its piece in the
    capstone, and the body explains why the order is input, then systems, then collisions,
    then scene switch, then render. Tab `main`:
    - TS: only the capstone's `State` type and the empty `init`/`update`/`render` signatures,
      with no system order.
    - Odin: a full, compiling `main.odin` (about 120 lines). It has the `advance` accumulator,
      `[Action]bool` from raylib keys, a `Scene :: enum`, the systems, AABB checks, a tiny
      xorshift RNG (avoid `core:math/rand`, whose API moved), and `BeginDrawing`. This is the
      native reference, so it can be complete.
16. **`capstone`** (sim). "Collect the coins, dodge the enemies."
    - **State:** `{ scene: "title" | "play" | "over", rng, score, best, time, player: AABB, coins: AABB[], enemies: (AABB & {vx, vy})[], actions }`.
    - **Provided** (the earlier pieces, single file):
      - `updateActions` with arrows/WASD (both cases) and `start: [" ", "Enter", "r", "R"]`;
      - `overlaps`;
      - `rand(s)` (mulberry32 on `s.rng`);
      - `newGame(seed)` (title scene), with `init = () => newGame(1)`;
      - `startRound(s)`: resets the player, score and time, and places 3 coins plus 3 enemies
        at least 80 px from the player, all via `rand`;
      - `respawnCoin(s, i)`;
      - `playerSystem(s, dt)` and `enemySystem(s, dt)` (bouncing off the edges);
      - `render` for each scene.
    - **The learner writes:**
      - `coinSystem(s)`: each coin that overlaps the player does `score += 1` and
        `respawnCoin`;
      - `hitSystem(s): boolean`: whether the player overlaps any enemy;
      - `update`:
        - in `title`, `start.pressed` calls `startRound` and switches to `play`;
        - in `play`, the order is player, then enemies, then coins, then hits; a hit switches
          to `over` and does `best = max(best, score)`;
        - in `over`, `start.pressed` calls `startRound` and switches to `play`;
        - no systems run outside `play`;
        - never use `Math.random` (stated, with the reason).
      - This is slightly more than the outline's "wiring" (coin and hit systems added) so that
        "a coin raises the score" tests learner code. See decisions.
    - **Starter:** the actions line and the title case only, so play is frozen.
    - **Visible tests:**
      - Space starts a round;
      - a coin on the player gives `score` 1 and keeps 3 coins (enemies cleared in the test);
      - touching an enemy goes to `over` and updates `best`;
      - a coin and an enemy hit in the same step count the coin, then go to `over` (order);
      - enemies don't move in `title`/`over`;
      - `r` and `R` restart with score 0, the player at the start and `best` kept;
      - holding Space through the death doesn't restart;
      - two 300-step runs from `newGame(7)` with the same scripted input are `toEqual`, and
        seeds 7 and 8 give different coins.
    - **Hidden test:** 2 seeds × 600 steps of random scripted input (drawn with `random()`
      before the runs), each run twice and compared with `toEqual`. Per-step invariants:
      `coins.length === 3`; score never drops within a round; a play-to-over step has the
      player overlapping an enemy; `best >= score` in `over`.
    - **Hints:** a `switch` on `scene`; the order and why coins come before hits; `pressed`,
      not `down`.
    - **Tabs:** none. The lesson body may suggest an ungraded stretch (add pause from
      `scene-stack`).

### Wiring

- `course.yaml`: append `input, physics, scenes, capstone` to `chapters` and keep
  `published: false`. Description: "The loop, memory layout, entities, rendering, input,
  physics and scenes behind a small 2D engine, built from scratch in TypeScript, with Odin
  alongside."
- `input/chapter.yaml`: `title: Input and actions`; lessons `input-to-actions, action-map,
  jump-buffer, input-quiz`.
- `physics/chapter.yaml`: `title: Physics and collision`; lessons `collision-pipeline,
  aabb-resolve, broadphase-pairs, tile-collision, physics-quiz`.
- `scenes/chapter.yaml`: `title: Assets and scenes`; lessons `assets-and-scenes,
  asset-cache, scene-format, scene-stack, scenes-quiz`.
- `capstone/chapter.yaml`: `title: Capstone`; lessons `putting-it-together, capstone`.
- No new lesson slug collides with an existing one (checked), which `odin/check.mjs` needs
  because it keys lessons by slug.
- Odin wrappers to add:
  - `input-to-actions/{poll,actions}`;
  - `collision-pipeline/{aabb,euler}`;
  - `assets-and-scenes/{cache,scenes}`;
  - `putting-it-together/main` (has `main`, so no `-no-entry-point`);
  - plus `action-map/bindings` and `broadphase-pairs/grid` if those optional tabs are kept.

### Order of work

1. Chapter yamls and `course.yaml`. Run validate once to confirm the course loads.
2. Chapters 5, 6, 7, then 8, one lesson at a time in the part-1 order: `solution.ts`, then
   tests (visible, then hidden), then `starter.ts` (derived from the solution), then
   `lesson.md`, then `hints.md`. Do the capstone last, since it copies `updateActions` and
   `overlaps` from the earlier solutions.
3. Odin wrappers, then `node odin/check.mjs --missing`: all ok, nothing missing.
4. Part 1's **Checks**: validate with no errors and no "starter already passes" warning for
   game-engine, `tsc -p /home/timish/source/fixedstep-content --noEmit`, and
   `node_modules/.bin/biome check .`. Then record the Odin version in the PR description.

### Risks

- **Leaks:** as in part 1. Visible tests for `jump-buffer` and `capstone` build scenarios but
  never encode the rule. The invariant models live only in `tests.hidden.ts`. No quiz
  `explanation` repeats another question's answer.
- **Grader time:** the heaviest lesson is the capstone's hidden test (4 runs × 600 steps of
  tiny arrays), which is fine. The implementer should confirm validate's per-lesson durations
  stay well under 1 s.
- **Stuck keys (platform, not fixed here):** keys are tracked by `e.key`, so pressing `p`,
  then Shift, then releasing leaves `p` stuck `true`. With edge-based pause, the next press
  then gives no edge. Losing canvas focus also sends no keyup. This is rare in play, and both
  letter cases are bound anyway. Possible platform follow-up: send `e.code`, or clear keys on
  blur.
- **CLAUDE.md invariants:** none touched (no platform code, DTOs, XP, `harnessRuntime` or
  cloud SDKs).

### Decisions (user, 2026-10-28)

1. **Capstone scope:** the learner writes `coinSystem` and `hitSystem` as well as the wiring.
2. **Stuck keys:** a separate platform task, `sim-stuck-keys` (bucket 3). Not part of this
   one; the lessons work as designed meanwhile.
3. **Optional Odin tabs:** keep `action-map/bindings` and `broadphase-pairs/grid`.
