# Forum levels and avatar frames

**Area:** `packages/db/src/schema.ts` (+ migration), `apps/api` (`forums` routes),
`packages/content-schema` (DTOs), `apps/web` (`Avatar` component, forum post header, profile).
**Depends on:** `forums`, `profile-image` (the `Avatar` component).
**Origin:** user request (2026-11-19).

## Problem

Users want a forum standing that's **separate from course XP**: a forum level earned from
posting and from likes received, shown on their forum avatar (a frame, ring or badge that
changes with level).

## Suggested approach

- **Score:** a per-user forum score, e.g. `posts × 1 + likes received × 3`, counting only
  non-deleted posts and likes from other, non-guest users. It is entirely separate from
  `xp_events`: forum activity must not change course XP, streaks or leaderboards.
- **Levels:** a small typed catalog in code (level, name, minimum score, avatar frame style),
  e.g. Newcomer → Regular → Contributor → Veteran → Legend.
- **Storage:** either compute on read from counts (simple, fine at small scale) or keep a
  `forum_user_stats` row (`user_id`, `post_count`, `likes_received`, `score`) updated in the
  same transaction as post/like/delete/moderation actions. Moderation removals and unlikes must
  lower the score.
- **Abuse:** likes are the farmable part. Count likes from accounts that pass the forums'
  posting rules (non-guest, verified/aged), cap how many likes from one user to another count
  per day, and don't count likes on deleted posts.
- **Display:**
  - the `Avatar` component takes an optional level and draws the frame (CSS/SVG, readable in
    light and dark themes)
  - the level name shows next to the author name on posts
  - the forum level can show on the profile page, if that section is visible
  - a short "How levels work" page or tooltip

## Open questions (designer: ask the user)

- Should the forum avatar be the same image as the profile image with a level frame, or can
  users set a separate forum avatar? (The request says "their forum avatar"; the frame-only
  approach reuses `profile-image`.)
- What are the exact weights, thresholds and level names?
- Should a level ever unlock anything (e.g. posting images, fewer rate limits), or is it
  cosmetic only?

## Acceptance criteria

- [ ] Each user's forum level is derived from posts and likes received, using the documented
      formula, and doesn't affect course XP.
- [ ] Deleting posts, removing likes and moderation correctly lower the score. Self-likes and
      guest likes don't count.
- [ ] The level is shown on the forum avatar and next to the author's name on posts.
- [ ] Unit tests for the level catalog and score computation, including the anti-farming caps;
      API tests that the score updates; an e2e check that the frame renders.
- [ ] Lint, typecheck and tests pass.
