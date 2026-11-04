# Leaderboards: lifetime XP and XP this week

**Area:** `apps/api` (new route), `apps/web` (new page and nav link), maybe `packages/db`
(index), `packages/content-schema` (DTO).
**Depends on:** nothing. Related: `privacy-policy-and-terms` (leaderboards make display names
public, so the privacy policy must say so), `achievements` (shares the XP ledger).
**Origin:** user request (2026-11-03).

## Problem

XP is awarded, but learners can't see how they compare with each other. Add a leaderboard
with two categories:

1. **Lifetime:** most XP earned in total.
2. **This week:** most XP earned in the current week.

## Notes from the code

- XP lives in the append-only `xp_events` ledger (`packages/db/src/schema.ts`): `userId`,
  `amount`, `reason` (`lesson_complete`, `streak_bonus`, `achievement`) and `createdAt`. Both
  boards are `SUM(amount)` grouped by user. The weekly board also filters
  `createdAt >= start of week`. Award XP only through server-side grading
  (`apps/api/src/lib/progress.ts`). The leaderboard only reads.
- The existing index is `xp_events_user_created_idx (user_id, created_at)`. Check the query
  plan for the weekly board, and decide whether lifetime totals need a cached or materialized
  total at the expected scale.
- `user.isAnonymous` marks guests. Leave guests off both boards.
- `user.name` is the only display field, and it may be a real name (sign-up, or the GitHub
  profile name).

## Suggested approach

1. **API:** `GET /api/leaderboard?period=lifetime|week` returns the top N (e.g. 50) rows
   `{ rank, displayName, xp }`, plus the caller's own rank and XP if they're signed in and
   not in the top N. Build the response field by field from a new `@fixedstep/content-schema`
   DTO. Never include email, user id or role.
2. **Week boundary:** pick one and document it, e.g. Monday 00:00 UTC. Show "resets in …"
   on the page.
3. **Ties:** order by XP descending, then by who reached that total first (earliest last
   event), so the order is stable.
4. **Web:** a `/leaderboard` page with Lifetime / This week tabs, linked from the nav, with
   the current user's row highlighted.
5. **Privacy:** decide whether display names are shown by default or opt-in. At minimum,
   add a setting to hide yourself from the leaderboard, and list "leaderboard display name"
   in the privacy policy.

## Open questions (designer: ask the user)

- Opt-in, opt-out, or always on? Show the full name or a shortened one (first name plus
  last initial)?
- Top N size, and whether a signed-in user outside the top N sees their own rank.
- Week boundary and time zone (UTC, or the user's local week).
- Whether admins (`role = admin`) and test accounts are excluded.
- Whether all XP reasons count, or only `lesson_complete`.

## Acceptance criteria

- [ ] `GET /api/leaderboard` returns the lifetime and this-week top N from `xp_events`,
      leaves guests (and anyone hidden) off, and exposes only rank, display name and XP.
- [ ] A `/leaderboard` page with Lifetime and This week tabs, linked from the nav, that
      highlights the current user.
- [ ] The week boundary and tie-break rule are defined, documented and tested.
- [ ] Users can hide themselves from the leaderboard, and the privacy policy mentions
      leaderboard display names.
- [ ] Tests for the aggregation (week boundaries, ties, guests and hidden users left off),
      and an e2e check of the page.
