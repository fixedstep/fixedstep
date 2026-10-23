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

- [ ] Catalog cards for courses with no average (`rating.average === null`) show "No ratings
      yet" (or the agreed wording), and still show no average.
- [ ] On a lesson page, the rating summary and (for eligible users) the widget are visible
      without opening the outline, on desktop and at phone width.
- [ ] The lesson shell (bar plus outline) renders at most one interactive widget. The completion
      card's widget on a course's last lesson may appear as well, since radio names are unique
      per widget.
- [ ] Manual check in `pnpm dev`: keyboard use and the save feedback still work in the new spot.
- [ ] Lint, typecheck and tests pass.
