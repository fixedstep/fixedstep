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

- [ ] `courses/game-engine/` in the content repo with `course.yaml` (`published: false` until
      reviewed) and the agreed chapters.
- [ ] Every `code`/`sim` lesson has a `solution.ts` that passes its tests;
      `pnpm content:validate` passes.
- [ ] Each reading lesson has TS/Odin snippet tabs for its key code; Odin snippets compile
      with the current Odin release (checked locally; not graded).
- [ ] Manually played through in `pnpm content:dev`, at desktop and phone width.
