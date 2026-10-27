# Run the e2e suite in Firefox too

**Area:** `e2e/playwright.config.ts`, `.github/workflows/ci.yml` (`e2e` job), `CLAUDE.md`
(*Running checks*), `README.md` (e2e section)
**Depends on:** nothing.
**Origin:** `course-ratings-discoverability` (2026-10-27). The user's manual check in Firefox
found the lesson-bar rating sliding left while "Saving…" showed. Playwright only runs Chromium,
which reserves a flex item's `flex-basis` when sizing a flex container and Firefox doesn't, so
the e2e tests passed on the broken CSS.

## Problem

`e2e/playwright.config.ts` has a single `chromium` project, and CI installs only
`--only-shell chromium`. Layout and behaviour differences in Gecko (and WebKit) are found only by
hand, if at all.

## Suggested approach

- Add a `firefox` project (`devices["Desktop Firefox"]`, same 1280×800 viewport) next to
  `chromium`. Specs run in both by default; tag or `test.skip` anything genuinely
  browser-specific, with a reason.
- CI: install Firefox too (`playwright install --with-deps chromium firefox`, keep the
  `~/.cache/ms-playwright` cache keyed on the Playwright version). Check the extra CI time; if it
  matters, run Firefox with fewer workers or only on PRs touching `apps/web/**` / `e2e/**`.
- Local: document the one-off `! pnpm --filter @fixedstep/e2e exec playwright install firefox`
  (Playwright's CDN isn't an allowed sandbox domain, so the user runs it), and how to run one
  project (`--project chromium`). The agents' verbatim command in CLAUDE.md stays the same and
  runs both.
- Verify the suite catches the original bug: temporarily restore the lesson-bar rating CSS from
  commit `2b58da1` (status in flow inside the stars' fieldset, width reserved only by
  `flex: 0 0 16rem`) and run the course-rating steady-layout check at 1280px **without**
  `flushRight`. Its layout checks (summary beside the stars, status left of the summary) assume
  the current layout and fail on the old CSS in every browser; only the "nothing moves while
  saving" position checks show the bug. Those should fail in Firefox and pass in Chromium. Then
  put the current CSS back.
- WebKit is out of scope unless it's cheap once Firefox works; note it as a follow-up.

## Acceptance criteria

- [ ] `playwright.config.ts` runs every spec in Chromium and Firefox; all pass in both.
- [ ] CI installs and caches both browsers and runs both projects; the extra CI time is noted.
- [ ] With the lesson-bar rating CSS from `2b58da1` restored, the 1280px steady-position checks
      (without `flushRight`) fail in Firefox and pass in Chromium, showing the suite would have
      caught the bug; with current CSS the full test passes in both.
- [ ] README and CLAUDE.md say how to install Firefox locally and run a single project.
- [ ] Lint, typecheck and tests pass.
