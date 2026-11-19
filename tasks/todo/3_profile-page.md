# Profile page (private by default, shareable)

**Area:** `packages/db/src/schema.ts` (+ migration), `apps/api` (new `profiles` routes),
`packages/content-schema` (DTOs), `apps/web` (`/u/$handle` page, settings section),
`apps/web/src/legal/privacy.md`, `e2e/`.
**Depends on:** `header-user-menu`, `profile-image`. Related: `achievements` and `leaderboards`
(both could show on the profile), `profile-games` (builds on this), `account-self-deletion`
(the profile must be deleted with the account).
**Origin:** user request (2026-11-19).

## Problem

Users have no page of their own. They want a profile that is **private by default** and that
they can choose to share, showing their progress and, later, their games (`profile-games`).

## Suggested approach

- **Storage:** a `profiles` table keyed by `user_id` (cascade on delete) with:
  - a unique `handle` (lowercase, `[a-z0-9-]{3,30}`, reserved words blocked)
  - `visibility`: `private` | `unlisted` | `public` (default `private`)
  - `bio` (short, plain text or limited Markdown rendered safely)
  - per-section toggles, e.g. `show_progress`, `show_achievements`

  Guests can't create a profile.
- **API:**
  - `GET /api/profiles/:handle` returns 404 unless the profile is visible to the caller. Use the
    same 404 for "private" and "doesn't exist", so handles can't be enumerated.
  - `GET/PUT /api/me/profile` for the owner.

  Build responses field by field from DTOs: never email, user id or role. Progress means only
  aggregate, already-earned data: courses with completed and total lesson counts, XP, streak,
  and achievements if that task has landed. Nothing about lesson content, hidden tests,
  solutions or answers.
- **Web:**
  - a `/u/$handle` page
  - a "Profile" item in the header menu
  - a settings section to claim a handle, set visibility and section toggles, and copy the share
    link

  The owner sees a "Only you can see this" banner while the profile is private.
- **Sharing:** `unlisted` = anyone with the link; `public` = may also be listed or linked from
  forums and leaderboards. Add `noindex` for anything not `public`, and Open Graph tags for
  public profiles (ties into `seo`).
- **Privacy policy:** describe what a shared profile exposes.

## Open questions (designer: ask the user)

- Are three visibility levels needed, or just private/public?
- Is the handle chosen by the user or derived from their name? Can it be changed, and does the
  old link redirect?
- Should the forums (`forums`) link to profiles, and what does a private profile show there?

## Acceptance criteria

- [ ] New profiles are private. Only the owner can see a private profile, and others get the
      same 404 as for an unknown handle.
- [ ] The owner can set a handle, change visibility and choose which sections show.
- [ ] Shared profiles show only aggregate progress fields from a DTO, with no email or ids.
- [ ] Profiles are deleted with the user (cascade).
- [ ] The privacy policy is updated.
- [ ] API tests for visibility rules and handle validation/uniqueness; e2e for creating,
      sharing and viewing a profile signed out.
- [ ] Lint, typecheck and tests pass.
