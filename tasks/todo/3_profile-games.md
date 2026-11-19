# Profile games: links and embedded web games

**Area:** `packages/db/src/schema.ts` (+ migration), `apps/api` (profile games routes, CSP
headers), `packages/content-schema` (DTOs), `apps/web` (profile page section, settings editor),
`infra/` (if games are hosted by us), `apps/web/src/legal/terms.md`, `e2e/`.
**Depends on:** `profile-page`. Related: `game-engine-course` / `game-engine-course-part-2`
(the games learners build), `profile-image` (shares any object-storage work).
**Origin:** user request (2026-11-19).

## Problem

Learners build games in the course. They want to show them on their profile: as **links** to
wherever they host them, and as **web games embedded** on the page. This is optional; profiles
without games show nothing.

## Security is the core of this task

Embedding user-supplied web content on our origin is how a site gets XSS'd and its session
cookies stolen. Whatever we choose:

- Never render user games in our app origin. Use an `<iframe sandbox="allow-scripts">`
  **without** `allow-same-origin`, ideally served from a separate origin (e.g.
  `games.<domain>`) or an allowlisted third-party host.
- Set `frame-src` in the app's CSP to only the allowed game origins, and
  `frame-ancestors`/`X-Frame-Options` so our app itself can't be framed.
- Links: only `https:` URLs, rendered with `rel="noopener noreferrer nofollow ugc"`, plus a
  "you're leaving fixedstep" hint if wanted.
- Rate-limit creates and edits, cap the number of games per profile, and add a report link
  (feeds the moderation story shared with `forums`).

## Options for embeds (designer: pick with the user)

1. **Allowlisted hosts only:** itch.io embed URLs, GitHub Pages, and similar. Store the URL and
   validate it against the allowlist. No hosting cost, and the third party carries the content
   risk.
2. **Host from the course sandbox:** publish the learner's game-engine lesson code (which we
   already run in the browser) as a snapshot served from a sandboxed games origin. This fits the
   course best, but needs storage, a separate origin in infra (AWS and GCP both), and a
   moderation process.

Option 1 first, with option 2 as a follow-up, is the likely order.

## Suggested approach

- A `profile_games` table: `id`, `user_id` (cascade), `title`, `description`, `kind`
  (`link` | `embed`), `url`, `position`, timestamps.
- Owner CRUD at `/api/me/profile/games`. Games are returned inside the profile response,
  following the profile's visibility rules.
- Web: a "Games" section on `/u/$handle` with cards. Embeds are click-to-load (no autoplay, and
  nothing third-party loads until clicked, which also matters for privacy). Add an editor in
  settings.
- Terms of service: users are responsible for what they link or embed, and we can remove it.

## Acceptance criteria

- [ ] Owners can add, edit, reorder and remove game links and embeds. Games show only on
      profiles visible to the viewer.
- [ ] Embeds render only in a sandboxed iframe without `allow-same-origin`, from allowed
      origins enforced by both validation and CSP `frame-src`.
- [ ] Non-`https` and non-allowlisted URLs are rejected server-side.
- [ ] Per-profile caps and rate limits are in place, plus a report link.
- [ ] The terms are updated.
- [ ] API tests for URL validation and visibility; e2e for adding a link and an embed and
      viewing them.
- [ ] Lint, typecheck and tests pass.
