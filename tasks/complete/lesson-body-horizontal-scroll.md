# Reading lessons scroll sideways at phone width

**Area:** `apps/web/src/styles.css` (`.snippet-tabs`, `.tab-row`, `.prose`, `.lesson-body`),
`apps/web/src/components/Markdown.tsx`, `apps/web/src/components/LessonShell.tsx`
**Depends on:** nothing. Small; can also be done as part of `css-in-ts-vanilla-extract`.
**Origin:** found by the course-tester during `course-ratings-discoverability` (2026-10-27).
Not caused by that change.

## Problem

At a 360×740 viewport, a reading lesson (e.g. 2D Game Fundamentals → *What is a game loop?*)
scrolls sideways: `document.documentElement.scrollWidth` is 504px. `.lesson-body` and its
children (the `h1`, `.prose`, `.snippet-tabs` / `.tab-row`) are all 504px wide, so something in
the body forces its width; the multi-language snippet tabs are the likely cause (a tab row or a
`<pre>` that doesn't shrink or scroll on its own).

Repro: 360×740 viewport, sign up, open `/lessons/<what-is-a-game-loop id>`, check
`document.documentElement.scrollWidth` (expect 360).

## Suggested approach

- Find the element that sets the width (probably `.tab-row` with non-wrapping tabs, or a
  `<pre>` without `overflow-x: auto`/`max-width: 100%`, or a flex/grid child missing
  `min-width: 0`).
- Fix it so code blocks and tab rows scroll inside their own box, and long words/URLs in prose
  wrap. The page itself must not scroll sideways.
- Check other lesson kinds (quiz, code, sim) and the home page at 360px for the same problem.

## Acceptance criteria

- [x] At 360px, reading, quiz, code and sim lesson pages have no horizontal page scroll; wide
      code blocks and tab rows scroll inside their own box. Reading, quiz, code, home and the sim
      paywall are covered by `e2e/specs/phone-layout.spec.ts`. The Pro-only sim lesson body is
      covered by reading the CSS (it shares every layout rule with code). It wasn't checked by
      hand, because e2e has no way to make a Pro user.
- [x] An e2e check asserts `scrollWidth <= clientWidth` on a reading lesson at 360px (the
      course-rating phone test can then check the whole page instead of only the bar).
- [x] No change at desktop widths. Checked by reading the CSS; the 800px and 1280px
      course-rating tests still pass.
- [x] Lint, typecheck and tests pass (biome, tsc for all 9 projects, vitest 319/319,
      Playwright 24/24).

## Plan

### Diagnosis (from the code)

Ancestors of `.lesson-body`: `.app` (flex column) > `main` (`width:100%`, 16px padding) >
`.lesson-shell` (grid, `minmax(0, 1fr)`) > `.lesson-main` (`min-width:0`,
`container-type:inline-size`, so its own width is fine) > `article.lesson.lesson-<kind>` >
`.lesson-body`.

- **Root cause:** `.lesson` is `display:grid` with no `grid-template-columns` for reading and
  quiz lessons. The implicit column is `auto`, so its minimum is `.lesson-body`'s min-content
  contribution. `.lesson-body` is a grid item with `min-width:auto` and isn't a scroll container,
  so the longest unbreakable line inside it sets the column width. `pre { overflow-x:auto }`
  doesn't help: intrinsic sizes ignore overflow, and the grid item is what lacks a 0 minimum. In
  *What is a game loop?* the widest lines are in the active TypeScript tab
  (`  const input = readInput();        // 1. process input`, 55 monospace chars at 14px, about
  490px with padding and border) and the inline playground's CodeMirror (`white-space:pre`,
  lines up to about 100 chars). The track grows, `.lesson-body` and every child (h1, `.prose`,
  `.snippet-tabs`) stretch to it, the article overflows `.lesson-main`, and the page scrolls.
  The tab row (4 short tabs, about 240px) isn't the cause at 360px today, but more languages
  would make it one.
- **Code/sim:** `@media (max-width: 900px)` sets `.lesson-code, .lesson-sim` to `1fr`
  (= `minmax(auto, 1fr)`, the same problem). At 360px it's masked by the later
  `@container (max-width: 860px)` rule (`minmax(0, 1fr)`). It still bites when the container is
  861 to 868px (viewport 893 to 900px).
- **Home:** `.chapters` is `repeat(auto-fill, minmax(320px, 1fr))`. At 360px the course card's
  content box is about 278px (328 − 2×24 padding − 2×1 border), so the column overflows by
  about 42px. `.lesson-list a`'s `margin: 0 -10px` adds 10px more. The page scrolls by about
  11px. `.hero` at ≤900px is `1fr`, which is fine until "Show code" mounts CodeMirror in the hero
  playground.
- **Topbar (every page):** `.topbar` and `.topbar-right` don't wrap. For a Pro user (PRO badge,
  "Manage billing", "Sign out") the right side's min-content plus the brand is about 400px, more
  than the 328px available, so every lesson page scrolls for Pro users at 360px. Free users and
  guests fit because the text shrinks and wraps.

### Scope

Covers every criterion. **Partly deferred:** the *sim* lesson body can't be e2e-checked because
`bouncing-ball` is the only sim lesson, it's `access: paid`, and e2e has no way to make a Pro
user. Sim shares every layout rule with code (`.lesson-code, .lesson-sim`), and the code lesson
is e2e-checked. The tester should check sim by hand at 360px (dev stack, Pro user) and record it
in the PR.

### Changes

1. `apps/web/src/styles.css` (all changes are no-ops at ≥1024px; why is noted on each line):
   - `.lesson`: add `grid-template-columns: minmax(0, 1fr);`. At desktop the `auto` track
     already stretched to the container, and `.lesson-body`'s 760px max-width still caps the
     body. `.lesson-code, .lesson-sim` come later with the same specificity, so their
     two-column template still wins.
   - `@media (max-width: 900px) .lesson-code, .lesson-sim`: change `1fr` to `minmax(0, 1fr)`.
   - `.lesson-body`: add `overflow-wrap: break-word;` so long words and URLs in prose and the
     title wrap. `break-word` (not `anywhere`) leaves min-content alone, so nothing intrinsic
     changes. It has no effect on `white-space:pre` blocks or CodeMirror.
   - `.tab-row`: add `overflow-x: auto;` so a long tab row scrolls in its own box. `.tab`: add
     `flex: none; white-space: nowrap;`. New `.tab:focus-visible { outline-offset: -2px; }`,
     because the scroll container would otherwise clip the focus ring. This focus ring is the
     only desktop-visible difference, and only on keyboard focus.
   - `.chapters`: change to `repeat(auto-fill, minmax(min(320px, 100%), 1fr))`.
   - `@media (max-width: 900px) .hero`: change `1fr` to `minmax(0, 1fr)`.
   - `.topbar`: add `flex-wrap: wrap; gap: 8px 12px;`. `.topbar-right`: add `flex-wrap: wrap;`.
     With `space-between`, the gap is only a minimum, so desktop is unchanged.
2. `apps/web/src/components/Markdown.tsx` and `LessonShell.tsx`: **no change needed.**
3. `e2e/support/layout.ts` (new):
   ```ts
   /** The page doesn't scroll sideways: html scrollWidth <= clientWidth. */
   export async function expectNoPageScrollX(page: Page): Promise<void>
   ```
   Reads `document.documentElement.scrollWidth` / `.clientWidth` in one `page.evaluate`. On
   failure, the message includes the widest offenders, e.g. the first 5 elements whose
   `getBoundingClientRect().right > clientWidth`, as `tag.class` strings, so the next
   regression is easy to pin down.
4. `e2e/specs/phone-layout.spec.ts` (new): `test.use({ viewport: { width: 360, height: 740 } })`.
   See Tests.
5. `e2e/specs/course-rating.spec.ts`, test "the rating line fits at phone width": delete the
   "Scoped to the bar: the reading lesson's own body is wider than 360px…" comment and add
   `await expectNoPageScrollX(page);` after the bar checks (before `expectSteadyWhileSaving`).
   Keep the bar and rating box checks, since they pin the bar itself. Optionally call it again
   at the end, after the save text has cleared.

No DTO, API, infra or content-sample changes.

### Tests

No vitest changes: `apps/web` only unit-tests `src/lib/*`, and this is CSS. The e2e content is
`content-sample/courses/2d-fundamentals` (slugs in `e2e/support/env.ts`, `LESSONS`).
`what-is-a-game-loop` has a 4-language `group=loop` snippet (ts/cpp/csharp/odin, lines up to 55
chars) plus a `ts playground`, so it covers both wide-content paths. `moving-with-delta-time` is
the code lesson. `fixed-timestep-quiz` is the quiz.

`e2e/specs/phone-layout.spec.ts`. Each test calls `signUp(page.request)` unless noted, which
gives the widest non-Pro topbar:
- **reading lesson:** go to `LESSONS.reading`. Wait for the h1 "What is a game loop?",
  `.snippet-tabs pre` and `.playground .cm-content` to be visible. Assert the snippet `pre`'s
  `scrollWidth > clientWidth`. This guards against the content becoming too narrow for the test
  to mean anything, and proves the block scrolls in its own box. Then
  `expectNoPageScrollX(page)`. Click each tab (`getByRole("tab", { name: "C++" | "C#" | "Odin" })`)
  and re-assert after each.
- **quiz lesson:** go to `LESSONS.quiz`, wait for the "Submit answers" button, then
  `expectNoPageScrollX`.
- **code lesson:** go to `LESSONS.code`, wait for `.workspace .cm-editor`, then
  `expectNoPageScrollX`.
- **home, signed out** (no signUp): `/`, wait for `.course-card .chapters`, assert. Then click
  "</> Show code" in the hero playground, wait for `.hero .cm-content`, and assert again.
- **home, signed in:** `signUp`, `/`, wait for "Pick up where you left off" and `.chapters`,
  then assert.
- **paywall (sim lesson) signed in:** go to `LESSONS.paid`, wait for "Upgrade to Pro", then
  assert. This is the only sim-route coverage available.

Don't rate or complete the quiz in these tests. `course-rating.spec.ts` depends on the shared
course rating state.

Checks: `node_modules/.bin/biome check .`, `node_modules/.bin/tsc -p e2e --noEmit` and
`node_modules/.bin/tsc -p apps/web --noEmit`, and
`node_modules/.bin/vitest run --configLoader runner`. The e2e suite runs as exactly
`e2e/node_modules/.bin/playwright test --config e2e/playwright.config.ts`. The existing 1280/800px
course-rating tests (`flushRight`) act as the desktop regression guard. The tester should also
compare a 1280px screenshot of the reading lesson and home before and after.

### Optional (not needed for the criteria; take only if trivial during review)

- `.prev-next`: `repeat(2, minmax(0, 1fr))` instead of `1fr 1fr`, so a long next-lesson title
  can't widen the page.
- `.quiz fieldset { min-inline-size: 0; }`: the fieldset's default `min-content` minimum would
  resist shrinking if an option ever contains long inline code.
- `.tweaks label`: middle column `minmax(0, 1fr)`. At 360px the range input fits with about 5px
  to spare.
- `.prose img { max-width: 100%; height: auto; }` for images in private content.

### Risks

- No CLAUDE.md invariants are touched: CSS and e2e only. No DTOs, so no hidden tests, solutions
  or answers reach the browser. No XP writes, no `harnessRuntime` changes, no cloud SDKs.
- Desktop parity depends on the `auto` and `minmax(0, 1fr)` tracks resolving the same when the
  content fits. They do in a definite-width container. The only intended visible delta is the
  tab focus-ring offset.
- `overflow-x:auto` on `.tab-row` also makes `overflow-y` compute to `auto`. The tabs have no
  vertical overflow, so no scrollbar should appear. Verify there's no 1px vertical scrollbar in
  Chrome at desktop.
- The topbar now wraps for Pro users at phone width (second row). That's intended, but untested
  by e2e (no Pro seam).
