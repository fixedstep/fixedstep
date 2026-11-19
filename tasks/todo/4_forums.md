# Forums

**Area:** `packages/db/src/schema.ts` (+ migrations), `apps/api` (new `forums` routes, rate
limits, admin moderation), `packages/content-schema` (DTOs), `apps/web` (forum pages, nav
link), `apps/web/src/legal/{privacy,terms}.md`, `e2e/`.
**Depends on:** `header-user-menu`, `profile-image` (avatars in posts). Related: `profile-page`
(author links), `forum-levels` (builds on this), `account-self-deletion` (what happens to
posts).
**Origin:** user request (2026-11-19).

## Problem

Learners have nowhere to ask questions or show their work to each other. Add forums with
threads, replies and likes.

## Suggested approach

- **Schema:**
  - `forum_categories` (admin-defined; maybe one per course plus "General" and "Show your game")
  - `forum_threads` (`category_id`, `author_id`, `title`, `pinned`, `locked`, timestamps)
  - `forum_posts` (`thread_id`, `author_id`, `body`, `edited_at`, `deleted_at`)
  - `forum_post_likes` (`post_id`, `user_id`, unique pair, no self-likes)

  Add indexes for listing threads by last activity and posts by thread.
- **Who can post:** signed-in, non-guest users. Consider requiring a verified email or a minimum
  account age to slow spam. Guests and signed-out visitors can read (designer decides whether
  forums are public or members-only).
- **Content:** Markdown rendered with the existing `Markdown` component, with raw HTML disabled
  or sanitised. Code blocks are welcome. Link `rel="nofollow ugc"`.
- **Spoilers:** a lesson-linked thread could leak solutions. At minimum add a spoiler block, and
  decide whether lesson categories hide threads until the reader has completed the lesson.
  Never auto-include `lessons.solution` or hidden tests anywhere.
- **Moderation (needed before launch):**
  - a report button
  - admin (`role = admin`) can delete/restore posts, lock/pin threads and ban posting
  - per-user rate limits on posts and likes (reuse `lib/rate-limit.ts`)
  - soft delete so moderation is auditable
- **API:** paginated list endpoints (cursor-based) and DTOs exposing author display name,
  avatar and profile handle (only if that profile is visible), never email, id or role.
- **Web:**
  - `/forums`, `/forums/$category` and `/forums/t/$threadId` pages
  - a nav/menu link
  - an optional "Discuss" link from lesson pages to that lesson's category

  Phone-width friendly.
- **Legal:** the terms gain content rules. The privacy policy covers forum posts and what happens
  to them when an account is deleted (anonymise to "deleted user" vs delete).

## Open questions (designer: ask the user)

- Are forums public (indexable) or signed-in only? Are any categories paid-only?
- Categories per course/chapter/lesson, or just a few fixed ones?
- What happens to posts when an account is deleted?
- Notifications (replies to your thread): in scope, or a follow-up?

## Acceptance criteria

- [ ] Non-guest users can create threads, reply, edit their own posts and like others' posts
      (once each, never their own).
- [ ] Admins can delete/restore posts, lock/pin threads and stop a user posting. Users can
      report posts.
- [ ] Rate limits are in place. Markdown is rendered safely (no raw HTML / XSS).
- [ ] Responses expose only DTO fields, with no email, ids or role, and no lesson solutions or
      hidden tests.
- [ ] The terms and privacy policy are updated.
- [ ] API tests for permissions, likes uniqueness and moderation; e2e for posting, replying and
      liking.
- [ ] Lint, typecheck and tests pass.
