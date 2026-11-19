# Profile image setting

**Area:** `apps/web` (`/settings` page, avatar component), `apps/api` (upload route or
better-auth `updateUser`), `packages/content-schema` (DTO), `infra/src/app-spec.ts` and
`infra/src/{aws,gcp}/` (if we store uploads), `apps/web/src/legal/privacy.md`.
**Depends on:** `header-user-menu` (the `/settings` page and the header avatar).
**Origin:** user request (2026-11-19).

## Problem

`user.image` exists (better-auth fills it from GitHub sign-in, and `/me` returns it), but users
can't change it, and email sign-ups have no image at all.

## Options (designer: pick with the user)

1. **Preset avatars only:** a built-in set of SVG avatars plus initials on a colour. No uploads,
   no storage, no moderation. `user.image` stores a preset id such as `preset:fox`.
2. **Gravatar:** derive the URL from a hash of the email. No storage, but it sends a hash of the
   email to a third party, so the privacy policy must say so.
3. **Uploads:** the user uploads an image. This needs object storage, which the app spec doesn't
   have yet. Add a cloud-neutral `storage` entry to `infra/src/app-spec.ts`, map it in both
   `infra/src/aws/` (S3) and `infra/src/gcp/` (GCS), and keep cloud SDKs out of `apps/` (per
   CLAUDE.md, for example by putting presigned URLs behind a small interface). Uploads need size
   and type limits, a server-side re-encode (strip EXIF, resize to e.g. 256px, output WebP/PNG),
   a rate limit, and a moderation/reporting story.

A sensible first cut is presets plus "use my GitHub image", with uploads as a follow-up.

## Suggested approach

- An `Avatar` component used by the header, `profile-page` and `forums`. It resolves
  `preset:*`, an http(s) URL or nothing (falling back to initials).
- Setting: a `/settings` section with a picker. Save through better-auth `updateUser({ image })`,
  validated server-side, or a dedicated `PUT /api/me/image`, so clients can't store arbitrary
  URLs. Accept only preset ids, the user's own linked-provider image, or our own storage URLs.
- Guests can't set an image (or the picker shows a sign-up nudge).
- Update the privacy policy for whatever is stored or shared.

## Acceptance criteria

- [ ] A signed-in user can change their profile image from `/settings`, and it shows in the
      header straight away.
- [ ] The server accepts only allowed image values. Arbitrary external URLs are rejected.
- [ ] If uploads are in scope: size and type limits, re-encoding, storage in both AWS and GCP
      infra, and no cloud SDK in `apps/`/`packages/`.
- [ ] The privacy policy is updated.
- [ ] API tests for validation; e2e for changing the image.
- [ ] Lint, typecheck and tests pass.
