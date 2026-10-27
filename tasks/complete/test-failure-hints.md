# Hints on failing tests

**Area:** `packages/test-harness/src/runtime.ts`, `packages/content-schema/src/index.ts`
(`TestResult`), `apps/web/src/components/ResultsPanel.tsx`, `content-sample/`,
`packages/content-cli/template/`
**Depends on:** nothing. Pairs with `hint-ladders`.
**Origin:** user request (2026-10-27). A free alternative to an AI tutor: authors attach the
"usual mistake" message to the test that catches it.

## Problem

A failing test shows its name and an assertion message such as `expected 0 to be close to 1.6`.
That says *what* is wrong, not the likely *why*. Authors usually know the common mistake behind
each test (forgot to multiply by `dt`, off-by-one at the grid edge) but have nowhere to put it.

## Suggested approach

- **Test API:** `test(name, fn, { hint })` in the harness runtime; `hint` is a short string.
  Keep `harnessRuntime` self-contained (no outer references, builtins captured up front);
  `runtime.test.ts` guards this. Add the optional third parameter to the ambient test types in
  the content repo skeleton (`packages/content-cli/template/`) and the sample's types.
- **Result:** `TestResult.hint?: string`, set only when the test failed. For hidden tests the
  hint is still returned: the author wrote it to be shown, unlike `error`, which can leak inputs
  and stays omitted.
- **UI:** `ResultsPanel` shows the hint under a failed test row (a 💡 line), for both the
  local run and the server run. Phone width: wraps, no horizontal scroll.
- **Content:** add hints to a couple of tests in `content-sample/` to show the pattern.

## Acceptance criteria

- [x] A test declared with `{ hint }` reports the hint when it fails and omits it when it passes,
      locally and on the server, visible and hidden.
- [x] Hidden tests still never return `error`.
- [x] Tests without a hint behave as before.
- [x] Harness tests cover the new parameter; `runtime.test.ts` still passes.
- [x] `ResultsPanel` shows the hint for failed tests; checked manually in `pnpm dev` (user,
      2026-10-27). Also covered by `e2e/specs/test-hints.spec.ts`.
- [x] Lint, typecheck and tests pass.

## Plan

### Scope

All acceptance criteria are covered on this branch. The `ResultsPanel` check is manual in
`pnpm dev` (the user or lead does it). `apps/web` has no component-test setup and adding one is
out of scope. Not in scope: copying the new `harness.d.ts` into the private content repo
(`types/harness.d.ts` there is a copy that gets refreshed when `PLATFORM_REF` is bumped, per
`template/tsconfig.json`). That is a follow-up in the content repo.

**How a hint flows:** test file → `test(name, fn, { hint })` in `harnessRuntime` → RawRun JSON →
`grade()` maps it into `TestResult.hint`. Both paths call `grade()`: the browser through
`apps/web/src/workers/tests.worker.ts` (functionExecutor), and the server through
`apps/grader/src/app.ts` or `apps/api/src/lib/grader.ts` local mode (quickjsExecutor). The API
passes `GradeResult` through unchanged (`routes/lessons.ts` returns `grade` and stores it in
`submissions.result` jsonb), so **apps/api and apps/grader need no code changes**. No DB
migration is needed either, because jsonb takes the new key. No e2e spec asserts on results
(checked `e2e/specs/`), so e2e is unaffected.

**Validation rules (decided here):**
- The runtime reads `opts.hint` once, when the test is registered. It keeps the hint only if
  `opts` is a non-null object and `typeof opts.hint === "string"`. Anything else (a number,
  `null` opts, `{}`, an omitted third arg) is **silently ignored**, and the test behaves as if it
  had no hint. We don't throw: a throw would surface as "Test file failed to load: …", which
  breaks the lesson for students and could carry a hidden test's real name to the browser.
  Authors get type errors from `harness.d.ts` instead.
- An empty string counts as no hint.
- **Length cap:** `grade()` truncates to `HINT_MAX_LENGTH = 300` chars. The cap lives in plain
  TS outside the runtime, which keeps `harnessRuntime` minimal.
- A hint is emitted only for failed tests: the runtime omits it when a test passes, and
  `grade()` only copies it when `!passed`.

### Changes (in order)

1. **`packages/content-schema/src/index.ts`**: add a field to `TestResult`:
   ```ts
   /** Author-written "usual mistake"; only on failed tests. Sent for hidden tests too (unlike error). */
   hint: z.string().optional(),
   ```
   This is a DTO change, but an additive optional one. Nothing parses `GradeResult` with zod on
   the response path, so there's no `.max()` here; the cap lives in `grade()`.

2. **`packages/test-harness/src/runtime.ts`**:
   - `type Registered = { name: string; fn: () => void; hidden: boolean; hint: string }`.
   - Change `test` to
     `const test = (name: string, fn: () => void, opts?: { hint?: unknown }) => { … }`. Compute
     `const h = typeof opts === "object" && opts !== null ? opts.hint : undefined;` and store
     `hint: typeof h === "string" ? h : ""`. Use only the existing captured builtins (none are
     actually needed). No new outer references.
   - In the run loop, append ``,"hint":${_stringify(r.hint)}`` only when
     `!passed && r.hint !== ""` (after the `error` part, in the same template). `_stringify` is
     only called on a primitive string, which keeps the existing guarantee.
   - `RawRun` results item: add `hint?: string`.
   - Optional: add one line to the doc comment noting that hints are author text shown for hidden
     tests too.

3. **`packages/test-harness/src/index.ts`**:
   - `export const HINT_MAX_LENGTH = 300;`
   - In the `grade()` mapping, compute
     `const hint = !r.passed && r.hint ? r.hint.slice(0, HINT_MAX_LENGTH) : undefined;` and spread
     `...(hint ? { hint } : {})` into **both** the hidden and visible objects. Spread rather than
     `hint: undefined` so the key is absent and existing `toEqual` checks keep their meaning.
     Hidden results still never include `error`.

4. **`packages/test-harness/authoring/harness.d.ts`**: change to
   `export function test(name: string, fn: () => void, opts?: { hint?: string }): void;` with
   JSDoc saying the hint appears under the test when it fails, is also shown for hidden tests
   (so it must not contain expected values or inputs), and is cut at 300 chars.
   `packages/content-cli/template/` needs **no edit**: `initContentRepo` copies this file into
   `types/harness.d.ts`. `content-sample/` has no types file of its own.

5. **`apps/web/src/components/ResultsPanel.tsx`**: next to `error`, compute
   `const hint = (s && !s.passed && s.hint) || (l && !l.passed && l.hint);`. Under the error
   line, render
   `{hint && <div className="test-hint"><span aria-hidden="true">💡</span> {hint}</div>}`.
   The server value takes precedence, the same as for `error`.

6. **`apps/web/src/styles.css`**: add a `.test-hint` rule (`font-size: 13px;
   overflow-wrap: anywhere; white-space: pre-wrap;`) and add `overflow-wrap: anywhere` to
   `.test-error` too, so long tokens wrap at phone width without horizontal scroll.

7. **`content-sample/`**: add hints to these tests (text is a suggestion):
   - `moving-with-delta-time/tests.ts` "moves along x":
     `{ hint: "Scale velocity by dt: pos + vel * dt, not pos + vel." }`
   - `moving-with-delta-time/tests.ts` "does not mutate the input":
     `{ hint: "Return a new object instead of assigning to pos.x / pos.y." }`
   - `bouncing-ball/tests.hidden.ts`: a general hint with no values, to show the hidden case,
     e.g. `{ hint: "Clamp the ball back inside the wall when you flip its velocity." }`

   Don't touch slugs or `solution.ts`, because e2e depends on them (see `e2e/support/env.ts`).

### Tests

Extend **`packages/test-harness/src/runtime.test.ts`**. Put the new cases inside the existing
`describe.each` so both the Function and QuickJS executors run them, which also exercises the
serialized-runtime guard. Add a fixture pair alongside `visibleTests`/`hiddenTests` that reuses
`good` (and `bad` = `good` with `100 * dt` replaced by `50 * dt`):
- visible test with `{ hint: "multiply by dt" }`, failing: `results[0].hint === "multiply by dt"`
  and `error` is still present.
- same test, passing (`good`): `results[0]` has no `hint` property
  (`not.toHaveProperty("hint")`).
- hidden test with a hint, failing:
  `toEqual({ name: "hidden test 1", passed: false, hidden: true, hint: "…" })`, and
  `not.toHaveProperty("error")`.
- failing test with no third arg: no `hint` key. Also add `not.toHaveProperty("hint")` to the
  existing "fails a wrong solution" case.
- non-string or empty values (`{ hint: 42 }`, `null`, `{}`, `{ hint: "" }`): no `hint`, and the
  test still registers and runs (it shows up in `results` as failed).
- a hint longer than `HINT_MAX_LENGTH` is truncated to exactly `HINT_MAX_LENGTH` chars.

No API test changes are needed (`lessons.test.ts` mocks the grader).

Checks, run from the repo root:
- `node_modules/.bin/biome check .`
- `node_modules/.bin/tsc -p <pkg> --noEmit` for `packages/content-schema`,
  `packages/test-harness`, `packages/content-cli`, `apps/web`, `apps/api`, `apps/grader`, and
  the rest of the list in CLAUDE.md
- `node_modules/.bin/vitest run --configLoader runner`
- optional, to confirm the sample content still loads and syncs:
  `e2e/node_modules/.bin/playwright test --config e2e/playwright.config.ts`

### Risks

- **Hidden-test leakage:** the hint is deliberately sent for hidden tests. `error` must still be
  omitted, and a test asserts this. The hidden test's real name must still never be sent: keep
  the `hidden test N` renaming and don't add a throw path for bad hints. The hint itself is
  static author text, so the JSDoc warns authors not to put inputs or expected values in it.
  `hiddenTests`, `solution` and quiz answers are untouched.
- **`harnessRuntime` self-containment:** the only change is inside the function body, using
  `typeof` checks and the existing `_stringify`. The QuickJS runs in `runtime.test.ts` would
  catch an outer reference. Student code shares the realm, so it could plant
  `Object.prototype.hint`. It can only affect its own display (pass/fail is decided separately),
  and tests without opts never look it up. That's acceptable.
- **XP/progress:** not touched. Grading status logic is unchanged.
- **Cloud SDKs / infra:** none. The app spec is unchanged, so there are no `infra/` edits.
