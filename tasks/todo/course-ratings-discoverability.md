# Make course ratings easier to find

**Area:** `apps/web/src/pages/home/CourseCatalog.tsx`, `apps/web/src/components/LessonShell.tsx`,
`apps/web/src/components/StarRating.tsx`, `apps/web/src/styles.css`
**Depends on:** `course-ratings` (PR #20) being merged.
**Origin:** user testing of `course-ratings` locally (2026-10-23). The user couldn't find the rating
UI on a fresh database.

## Problem

`course-ratings` shipped the UI in two places that are easy to miss:

1. **Catalog cards show nothing below 3 ratings.** This was the agreed rule, but on a new
   deployment, or for any new course, there's no hint that ratings exist.
2. **The star widget is only inside the course outline.** The outline is often collapsed on lesson
   pages; that depends on the lesson kind and the saved toggle state (`useOutlineOpen`). A learner
   has to click **☰ Outline** to see the summary or rate.

## Suggested approach

- **Catalog:** below `MIN_RATINGS_TO_SHOW`, show a muted "No ratings yet" (or "New") on each card
  instead of nothing. Keep showing no number until the threshold is met. Hiding the average below
  3 ratings stays as it is.
- **Lesson page:** add a compact rating line to the always-visible `lesson-bar`, next to the
  breadcrumb. It shows the summary, and the stars when `rateAccess` is `"rate"`. Keep the outline
  header version or remove it so the widget isn't rendered twice; a single widget is better for
  focus and for the debounced save. Check that it still fits at phone width (16px gutter, no
  horizontal scroll), collapsing to the summary only if needed.
- Reuse `RatingSummary` / `StarRating` as they are; no API changes.

## Acceptance criteria

- [ ] Catalog cards for courses under 3 ratings show "No ratings yet" (or the agreed wording),
      and still show no average.
- [ ] On a lesson page, the rating summary and (for eligible users) the widget are visible
      without opening the outline, on desktop and at phone width.
- [ ] Only one interactive widget is on the lesson page at a time.
- [ ] Manual check in `pnpm dev`: keyboard use and the save feedback still work in the new spot.
- [ ] Lint, typecheck and tests pass.
