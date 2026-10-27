# Achievements

**Area:** `packages/db/src/schema.ts`, `apps/api/src/lib/progress.ts`, `apps/api/src/routes/lessons.ts`,
`apps/api/src/routes/me.ts`, `packages/content-schema` (DTOs), `apps/web/src/components/CompletionCard.tsx`,
`apps/web/src/components/Layout.tsx`, `apps/web/src/lib/api.ts`
**Depends on:** nothing.
**Origin:** user request (2026-10-27).

## Problem

Learners get XP and a day streak, but nothing marks milestones (first lesson, finishing a course,
a 7-day streak, …). The schema already anticipates this: `xp_reason` includes `"achievement"`,
and `xp_events` has a `(user_id, reason, ref_id)` unique index that makes awards idempotent. Nothing
awards or shows achievements yet.

## Suggested approach

- **Definitions in code**, not in course content: a small typed catalog (id, title, description,
  optional XP bonus, and a predicate over the learner's stats). Suggested starting set:
  - first lesson completed
  - first code lesson passed / first quiz passed
  - chapter completed, course completed (one per course; `ref_id` = course or chapter id)
  - 3-, 7- and 30-day streaks
  - XP thresholds (e.g. 100 / 1,000)
- **Storage:** a `user_achievements` table (`user_id`, `achievement_id`, `ref_id` nullable,
  `earned_at`, unique on `(user_id, achievement_id, ref_id)`) plus a migration. Any XP bonus goes
  through `xp_events` with `reason = "achievement"` and a `ref_id` that encodes the achievement
  (and its scope) so it's awarded once.
- **Awarding:** only server-side, after grading, inside or right after `completeLesson`'s
  transaction (per CLAUDE.md, XP/progress are only written after server-side grading). Evaluate
  the catalog against the post-completion stats and insert with `onConflictDoNothing`; return the
  newly earned ones.
- **API:** add `newAchievements` to `SubmitResponse` (built field-by-field from a content-schema
  DTO), and an earned-achievements list on `/me` (or a dedicated `GET /me/achievements`).
- **Web:** show newly earned achievements on `CompletionCard` (alongside the XP/streak line), and
  a simple earned/locked list somewhere reachable from the header (profile menu or a small page).
  Phone width: 16px gutter, no horizontal scroll.
- **Backfill:** decide whether existing users get achievements retroactively (a one-off script or
  lazy evaluation on next `/me`), and whether a backfill awards the XP bonus.

## Open questions

- Should achievements grant XP, or be badges only? (Bonus XP inflates totals; badges-only is simpler.)
- Per-course achievements for paid courses: visible as "locked" to free users, or hidden?
- Streak achievements use UTC days like `streakFromDays`; is that acceptable for learners far from UTC?

## Acceptance criteria

- [ ] Achievements are awarded only by the API after a passing, server-graded submission, exactly
      once per user (and per scope, e.g. per course), including under concurrent submissions.
- [ ] Any achievement XP is recorded as an `xp_events` row with `reason = "achievement"` and is
      reflected in `/me` totals.
- [ ] The submit response lists achievements earned by that submission; the completion card shows them.
- [ ] Learners can see their earned (and, per the agreed rule, locked) achievements.
- [ ] No hidden tests, solutions or quiz answers leak through the new responses.
- [ ] Unit tests for the catalog predicates and idempotent awarding; API tests for the submit and
      `/me` responses.
- [ ] Lint, typecheck and tests pass.
