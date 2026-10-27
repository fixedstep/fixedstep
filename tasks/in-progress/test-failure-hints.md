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

- [ ] A test declared with `{ hint }` reports the hint when it fails and omits it when it passes,
      locally and on the server, visible and hidden.
- [ ] Hidden tests still never return `error`.
- [ ] Tests without a hint behave as before.
- [ ] Harness tests cover the new parameter; `runtime.test.ts` still passes.
- [ ] `ResultsPanel` shows the hint for failed tests; checked manually in `pnpm dev`.
- [ ] Lint, typecheck and tests pass.
