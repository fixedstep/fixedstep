# A Pro user for the e2e suite

**Area:** `e2e/support/start-api.ts`, `e2e/support/api.ts`, `e2e/specs/phone-layout.spec.ts`,
`e2e/specs/paywall.spec.ts`, `CLAUDE.md` / `README.md` (e2e notes)
**Depends on:** nothing.
**Origin:** `lesson-body-horizontal-scroll` (2026-11-03). Two acceptance checks there had to be
done by reading the CSS, because e2e has no way to make a Pro user: the sim lesson body at 360px,
and the topbar wrapping for Pro users (PRO badge, "Manage billing", "Sign out") at phone width.

## Problem

`e2e/support/api.ts` signs users up through the public API, and every user it makes is a free
user. Pro comes only from the `entitlements` table. Only a verified billing webhook
(`POST /api/billing/webhooks/polar`) writes that table, and `start-api.ts` blanks every
`POLAR_*` variable, so the webhook rejects everything ("webhook secret not configured"). As a
result, e2e never renders Pro-only UI: the sim lesson (`bouncing-ball`, `access: paid`), the PRO
badge, the "Manage billing" button, or any paid lesson's body.

## Suggested approach

- Grant Pro through the real webhook path, not a test-only backdoor in the API, and not a direct
  DB insert. This also exercises signature checks, event mapping and `hasPro` end to end.
  - In `start-api.ts`, set `POLAR_WEBHOOK_SECRET` to a fixed e2e-only value (e.g.
    `whsec_` + base64 of `e2e-only-webhook-secret`), after the loop that blanks `POLAR_*`. Leave
    `POLAR_ACCESS_TOKEN` and the product ids blank, so checkout and portal still can't reach
    Polar.
  - Export the secret from `e2e/support/env.ts`.
- New helper in `e2e/support/api.ts`:
  ```ts
  /** Makes the signed-in user Pro by posting a signed Polar `subscription.active` webhook. */
  export async function grantPro(request: APIRequestContext): Promise<void>
  ```
  - Read the user id from `/api/me`.
  - Build a `subscription.active` payload: `data.customer.external_id` = the user id, a random
    `data.id`, `status: "active"`, `created_at` = now, and `current_period_end` = now + 30 days.
  - Sign it Standard Webhooks style: HMAC-SHA256 over `${id}.${timestamp}.${body}`, sent as
    `webhook-id`, `webhook-timestamp` and `webhook-signature: v1,<base64>`. Match
    `verifyStandardWebhook` in `apps/api/src/billing/polar.ts`. Consider exporting a small
    signer from there for the e2e helper and the API tests to share, so the two can't drift.
  - Finally, assert `/api/me` returns `pro: true`.
- Use it:
  - `phone-layout.spec.ts`: add a Pro sim lesson test (wait for the sim canvas/workspace, then
    `expectNoPageScrollX`). Add a Pro topbar test on a reading lesson at 360px: the topbar wraps
    and the page doesn't scroll sideways.
  - `paywall.spec.ts`: add a test that a Pro user opens `LESSONS.paid` and sees the lesson, not
    "Upgrade to Pro".
- Docs: mention `grantPro` and the e2e-only webhook secret wherever e2e seeding is described.

## Acceptance criteria

- [ ] `grantPro` makes a signed-up e2e user Pro through the real webhook route, and `/api/me`
      then reports `pro: true`. The API source has no e2e-only code paths.
- [ ] The e2e API still can't reach Polar: no access token or product ids are set, and only the
      webhook secret is.
- [ ] e2e covers the sim lesson body and the Pro topbar at 360px with no horizontal page scroll.
      These replace the "checked by reading the CSS" notes in
      `lesson-body-horizontal-scroll`.
- [ ] e2e covers a Pro user opening the paid lesson instead of the paywall.
- [ ] Lint, typecheck, vitest and Playwright pass.
