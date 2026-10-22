# A billing webhook that fails once is never applied

**Area:** `apps/api/src/routes/billing.ts`, `apps/api/src/lib/entitlements.ts`
**Origin:** found while planning staging's Polar setup (2026-10-21)

## Problem

The webhook route (`POST /api/billing/webhooks/:provider`) dedupes events by inserting the
event id into `billing_events` first, with `onConflictDoNothing`. Only after that does it call
`applySubscriptionUpdate` and set `processedAt`.

If anything throws between the insert and the update, the route returns a 500 and the provider
retries. Possible causes are a transient DB error, a task replaced mid-request, or an
entitlement whose `user_id` doesn't exist. On the retry, though, the event id is already in
`billing_events`, so the insert returns no row. The route answers `{ ok: true, duplicate: true }`
and the update is never applied.

In prod this means a customer who paid can end up without Pro, and nothing alerts anyone. The
only trace is a `billing_events` row whose `processed_at` is null.

A related case: an event for an unknown user (a Polar org shared between environments, or a
user deleted after checkout) violates the `entitlements.user_id` foreign key. Today that's a 500
on the first delivery and a silent `duplicate` on the retries.

## Suggested approach

- Run the event insert, `applySubscriptionUpdate` and the `processedAt` update in **one
  transaction**. A failure then rolls back the event row and the retry processes it again.
  Alternatively, count an event as a duplicate only when its existing row has `processedAt` set.
- Decide what an event for a user that doesn't exist should do. Retrying won't help, so
  probably log it, record it as processed with a note, and return 2xx so the provider stops
  retrying.
- Optionally report unprocessed `billing_events` older than a few minutes, from logs or a
  health check.

## Acceptance criteria

- [ ] When applying a webhook throws, the provider's retry applies the update.
- [ ] A redelivery after successful processing is still a no-op (`duplicate: true`).
- [ ] An event for an unknown user doesn't 500 forever and is logged.
- [ ] Tests cover both the throw-then-retry case and the unknown-user case (there's no
      `billing` route test yet).
