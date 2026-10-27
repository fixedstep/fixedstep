# Make course ratings easier to find

**Area:** `apps/web/src/pages/home/CourseCatalog.tsx`, `apps/web/src/components/LessonShell.tsx`,
`apps/web/src/components/CompletionCard.tsx`, `apps/web/src/components/StarRating.tsx`,
`apps/web/src/styles.css`
**Depends on:** `course-ratings` (PR #20) being merged.
**Origin:** user testing of `course-ratings` locally (2026-10-23). The user couldn't find the rating
UI on a fresh database.

## Problem

`course-ratings` shipped the UI in places that are easy to miss:

1. **Catalog cards show nothing below 3 ratings.** This was the agreed rule, but on a new
   deployment, or for any new course, there's no hint that ratings exist.
2. **On most lesson pages the star widget is only inside the course outline.** The completion
   card also renders one, but only after passing a course's last lesson. On wide screens
   (1024px and up) the outline's open state depends on the lesson kind and the saved toggle
   state (`useOutlineOpen`); below 1024px the outline is a drawer that always starts closed
   (`LessonShell.tsx`). Either way a learner often has to click **☰ Outline** to see the summary
   or rate.

## Suggested approach

- **Catalog:** when `rating.average === null` (the API withholds the average below its minimum
  count; the web app has no copy of that threshold), show a muted "No ratings yet" (or "New") on
  each card instead of nothing. Hiding the average below 3 ratings stays as it is.
- **Lesson page:** add a compact rating line to the always-visible `lesson-bar`, next to the
  breadcrumb. It shows the summary, and the stars when `rateAccess` is `"rate"`. Keep the outline
  header version or remove it so the widget isn't rendered twice in the shell; a single widget
  there is better for focus and for the debounced save. The completion card's widget on a
  course's last lesson can stay: widgets have unique radio names (`useId`) and each keeps its
  own state, so two on one page don't interfere. Check that the bar still fits at phone width
  (16px gutter, no horizontal scroll), collapsing to the summary only if needed.
- Reuse `RatingSummary` / `StarRating` as they are; no API changes.

## Acceptance criteria

- [x] Catalog cards for courses with no average (`rating.average === null`) show "No ratings
      yet" (or the agreed wording), and still show no average. _Agreed wording: "Not enough
      ratings yet"._
- [x] On a lesson page, the rating summary and (for eligible users) the widget are visible
      without opening the outline, on desktop and at phone width.
- [x] The lesson shell (bar plus outline) renders at most one interactive widget. The completion
      card's widget on a course's last lesson may appear as well, since radio names are unique
      per widget.
- [x] Manual check in `pnpm dev`: keyboard use and the save feedback still work in the new spot.
      _Checked by the user in Firefox (2026-10-27) at full width, ~800px, just above 600px and
      phone width. E2E (Chromium) covers keyboard rating in the bar and a stable layout while
      saving at 1280/800/360px, plus the error message at 1280px._
- [x] Lint, typecheck and tests pass.

## Plan

> **Changed during implementation (user's choice, 2026-10-27):** one fixed string, "Not enough
> ratings yet", wherever `rating.average === null` (catalog cards and the lesson bar). The
> count-based `ratingEmptyText` helper, its unit tests and the e2e `getByText("No ratings yet")`
> described below were not built. Also changed after review: at ≤600px the stars get their own
> row (`flex-basis: 100%`) so save feedback can't move them, and the wide-screen status is
> `16rem` so the error message fits one line.
>
> **Changed after the user's manual check:** in Firefox the right-aligned group shifted left
> when "Saving…" appeared (the status reserved its width only via `flex-basis`, which Firefox
> ignores when sizing a flex container; Chromium doesn't, so e2e passed). At the user's request
> the wide-screen layout is now `[status] summary ★★★★★`, flush right: the summary sits beside
> the stars and the save text appears, right-aligned, in a slot to the left of the summary. The
> slot is `padding-left` on `.lesson-rating.can-rate` (only when the learner can rate) with the
> status absolutely positioned in it, so its text never affects the group's width in any engine.
> Phone layout unchanged. Follow-up: task `e2e-firefox`.

**Flags:** web-only. No API, DTO (`@fixedstep/content-schema`), DB, app-spec or infra changes, so
nothing changes in `infra/src/gcp` or `infra/src/aws` and there's no cost impact. Nothing is
deferred. The manual `pnpm dev` check (AC 4) is for the user.

### Checked against current code (main @ e8aad89)

The task's references still hold:
- `CourseCatalog.tsx:43` renders `<RatingSummary rating={course.rating} />` with no `emptyText`.
- `LessonShell.tsx` `.lesson-bar` (toggle + breadcrumb, l.27–46). The `Outline` header (l.72–80)
  renders the summary ("Not enough ratings yet"), `StarRating` for `"rate"` and `GuestNudge`
  for `"guest"`.
- `useOutlineOpen` (l.173) is unchanged.
- `CompletionCard.tsx:57–62` shows the widget on a course's last lesson.
- `StarRating.tsx` (`RatingSummary`, `StarRating`, `useId` radio names).
- `styles.css` `.lesson-bar` is at l.1038 and the rating styles at l.1251–1302.

The ResultsPanel hint line and HintsPanel render inside `children` (`.lesson-main`), not in the
bar, so this change doesn't affect them.

### Scope

All acceptance criteria. Decisions:
- **Outline header:** remove the summary and the `StarRating` from it, so the shell has exactly
  one interactive widget (in the bar). Keep the guest `GuestNudge` in the outline header (see
  `"guest"` below).
- **Behaviour per `rateAccess` in the bar:**
  - `"rate"`: summary plus stars.
  - `"guest"`: summary only. The nudge stays in the outline. Moving it into the bar would put a
    second visible link containing "Create a free account" on the page after a guest passes a
    lesson, and `guest-progress.spec.ts:36` (`getByRole("link", { name: "Create a free account" })`,
    a substring match) would then fail strict mode. Its dashed box is also too big for the bar.
  - `"none"` (signed out, or no completed lesson): summary only.

  So every learner sees the summary.
- **Wording:** the trigger is `rating.average === null`, as the task says. The text depends on
  `count`, which the API always sends, so the web app still doesn't need the threshold:
  - `count === 0` → "No ratings yet"
  - `count > 0` → "Not enough ratings yet" (keeps the course-page wording agreed in
    `course-ratings`; "No ratings yet" would be untrue at 1–2 ratings)

  The catalog and the bar both use it. If the lead wants one fixed string, pass
  `"No ratings yet"` instead and drop the helper and its test.

### Changes (in order)

1. **`apps/web/src/lib/rating.ts`**: add
   `export function ratingEmptyText(r: CourseRating): string`, which returns "No ratings yet" when
   `r.count === 0` and "Not enough ratings yet" otherwise. Callers only use it when
   `average === null`, because `RatingSummary` ignores `emptyText` when there is an average.
2. **`apps/web/src/pages/home/CourseCatalog.tsx`**: change l.43 to
   `<RatingSummary rating={course.rating} emptyText={ratingEmptyText(course.rating)} />`.
   `RatingSummary` already renders it as `<p class="rating-summary muted">` and never shows an
   average below the threshold.
3. **`apps/web/src/components/LessonShell.tsx`**:
   - New `function BarRating({ course }: { course: CourseOutline })` in the same file. It owns
     the `useQuery({ queryKey: ["me"], queryFn: api.me })`, which keeps hooks out of
     `LessonShell`'s early-return path. It renders:
     ```tsx
     <div className="lesson-rating" role="group" aria-label="Course rating">
       <RatingSummary rating={course.rating} emptyText={ratingEmptyText(course.rating)} />
       {rateAccess(me.data, course) === "rate" && <StarRating key={course.slug} course={course} />}
     </div>
     ```
     `key={course.slug}` matters. The bar stays mounted when the learner moves to another
     course's lesson. Without the key, `StarRating`'s `shown` and `unsent` state would carry
     over, and a pending debounced change would be PUT to the new course. With the key, the
     old widget unmounts and its unmount flush sends to the right slug.
   - Render `<BarRating course={ctx.course} />` as the last child of `.lesson-bar`, after the
     breadcrumb `<nav>`.
   - `Outline`: delete the `RatingSummary` and `StarRating` lines. Keep the `me` query,
     `rateAccess` and the `access === "guest"` `GuestNudge`. Drop the now-unused imports.
4. **`apps/web/src/components/StarRating.tsx`**: comment only. In the docblock, change
   "(outline and completion card)" to "(lesson bar and completion card)". No behaviour change.
   The debounce, the Enter/Space/blur/unmount sends and the `role="status"` region work the
   same in the bar.
5. **`apps/web/src/styles.css`** (lesson shell section, near l.1038/1184):
   - `.lesson-bar`: add `flex-wrap: wrap; row-gap: 6px;`.
   - New rules:
     ```css
     .lesson-rating { display: flex; flex-wrap: wrap; align-items: center; gap: 0 10px;
                      margin-left: auto; min-width: 0; }
     .lesson-rating .rating-summary,
     .lesson-rating .star-rating { margin: 0; }
     .lesson-rating .rating-status { flex: 0 0 13rem; }
     ```
     The fixed width reserves room for "Saved: you rated 4 out of 5" on wide screens, so the
     text appearing doesn't move anything. When the bar is too narrow, the whole group wraps
     onto its own row because `.lesson-bar` wraps.
   - In the existing `@media (max-width: 600px)` block:
     `.lesson-rating { flex-basis: 100%; margin-left: 0; }` and
     `.lesson-rating .rating-status { flex: 1 0 100%; margin-left: 0; }`.
     On phones the layout becomes:
     - row 1: toggle and breadcrumb
     - row 2: summary and stars, about 280px with "Not enough ratings yet" (fits 360 − 32 = 328px)
     - row 3: the reserved 18px status line

     That stops the status line from shifting the page during a save. Keep the 22px stars for
     the touch target. If row 2 doesn't fit at 320px, let `.lesson-rating` wrap the stars below
     the summary. That's the "collapse" the task allows. Don't hide the stars.
   - Check by eye at 360, 375, 768, 1024 and 1280px, with the outline open and closed:
     - no horizontal scroll
     - the breadcrumb still wraps
     - the bar stays one row at 1280 when the breadcrumb is short

### Tests

- **`apps/web/src/lib/rating.test.ts`**: add `describe("ratingEmptyText")` in the existing style:
  `count: 0` → "No ratings yet", and `count: 1` and `count: 2` (with `average: null`) →
  "Not enough ratings yet".
- **`e2e/specs/course-rating.spec.ts`**: this is the only spec that finds the widget in the
  outline (`getByRole("navigation", { name: "Course outline" })`, l.42–60). Update it:
  - Rename the test to "…rates the course from the lesson bar with the keyboard only". Replace
    `outline` with `const bar = page.getByRole("group", { name: "Course rating" })` for the
    summary, radio, status and "4.3 ★ (3)" assertions.
  - Add `await expect(page.locator("#course-outline .star-rating")).toHaveCount(0)` (one widget
    in the shell). Use a DOM locator because role queries skip a `hidden` outline.
  - At the very start, before the two raters: `page.goto("/")` and
    `expect(page.getByText("No ratings yet")).toBeVisible()`. The DB is fresh per run, and this
    is the only spec that rates.
  - Keep the "Not enough ratings yet" check (count 2), the single-PUT check and the `tabTo` flow.
    Tab order is now header → toggle → "Courses" → stars, so it still reaches the stars within
    40 presses.
  - New test, "the rating line fits at phone width":
    - `page.setViewportSize({ width: 360, height: 740 })`, sign up, complete the reading lesson,
      `goto` it, no rating.
    - Assert inside `bar`: the summary text and the "Rate 1 out of 5" radio are visible.
      `#course-outline` is hidden (drawer closed).
    - Assert no horizontal scroll:
      `page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)`
      is `true`.

      If that already fails on main because of the site header, scope the check to
      `.lesson-bar`, and note it as a separate issue.

    It doesn't rate, so the parallel first test still sees 3 ratings.
- Other specs need no edits:
  - `quiz.spec.ts`: after the pass there are two widgets on the last lesson (bar and card). It
    only queries quiz option radios by unique names.
  - `guest-progress.spec.ts`: the guest nudge stays in the collapsed outline on a code lesson.
  - `paywall`, `auth`, `test-hints` and `hint-ladder` don't touch ratings or the bar.
- **Manual only** (no DOM test setup in `apps/web`), user in `pnpm dev`:
  - In the bar, check that arrow keys debounce to one save, and that Enter, Space, click and
    Tab-away save at once.
  - "Saving…" and "Saved…" appear without moving the layout.
  - The focus ring is visible.
  - On the last lesson, the bar and completion-card widgets stay independent.
  - Check phone layout in devtools at 360px.
- Checks from the repo root:
  - `node_modules/.bin/biome check .`
  - `node_modules/.bin/tsc -p apps/web --noEmit` and `node_modules/.bin/tsc -p e2e --noEmit`
    (the rest of the CLAUDE.md list for completeness)
  - `node_modules/.bin/vitest run --configLoader runner`
  - `e2e/node_modules/.bin/playwright test --config e2e/playwright.config.ts`

### Risks

- CLAUDE.md invariants are untouched:
  - no new data reaches the browser (only the existing `rating` field)
  - no XP writes
  - no change to `harnessRuntime`
  - no cloud SDKs
- Two widgets on the last lesson share the `["courses"]` cache. Each has its own mutation and
  `useId` name, which the task already accepts. Both refetch on settle.
- e2e `getByText("No ratings yet")` on the home page could match more than once if
  `content-sample` gains a second course. Today it has one. If that changes, scope the check to
  the course card.

### Optional (not in this branch)

- A compact "Sign up to rate" link in the bar for `"guest"`. It needs a distinct link name
  (see Scope) and a small inline variant of `GuestNudge`.
