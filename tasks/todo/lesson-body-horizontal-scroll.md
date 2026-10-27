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

- [ ] At 360px, reading, quiz, code and sim lesson pages have no horizontal page scroll; wide
      code blocks and tab rows scroll inside their own box.
- [ ] An e2e check asserts `scrollWidth <= clientWidth` on a reading lesson at 360px (the
      course-rating phone test can then check the whole page instead of only the bar).
- [ ] No change at desktop widths.
- [ ] Lint, typecheck and tests pass.
