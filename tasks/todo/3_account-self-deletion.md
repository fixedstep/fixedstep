# Account self-deletion

**Area:** `apps/api` (`auth.ts`, a delete hook), `apps/web` (an account/settings entry point),
`apps/web/src/legal/privacy.md`, `README.md`.
**Depends on:** `privacy-policy-and-terms` (merged), which documents deletion by email.
**Origin:** user decision while planning `privacy-policy-and-terms` (2026-11-03).

## Problem

Users can only delete their account by emailing us. Deletion should be self-serve.

## Suggested approach

1. Enable better-auth `user.deleteUser` (fresh session or email confirmation). Guests are
   excluded; they expire on their own.
2. In a `beforeDelete` hook: refuse, or cancel first, if an entitlement is active (Polar API
   via `BillingProvider`, a new `cancelSubscription`); purge `billing_events` rows for the user
   (no FK, so the cascade misses them).
3. Web: a "Delete account" action with confirmation; on success, sign out and call
   `analytics.setUser(null)`.
4. PostHog person deletion needs a personal API key server-side: decide whether to automate
   it or keep it a manual runbook step.
5. Update the privacy policy's deletion section and the README runbook.

## Acceptance criteria

- [ ] A signed-in, non-guest user can delete their account, with confirmation.
- [ ] All user rows (cascade) and their `billing_events` are gone; any active subscription is
      cancelled first.
- [ ] The privacy policy and README describe the new flow.
- [ ] API tests cover the delete hook; e2e covers the flow.
