# Polar setup

Billing runs through Polar behind the `BillingProvider` interface (`apps/api/src/billing/`),
calling Polar's REST API directly (no SDK). Webhooks update the `entitlements` table, which is
the only thing the app checks for Pro access.

**Current environment: sandbox** (`POLAR_SERVER=sandbox`). Nothing here touches the live
`fixed-step` org yet. Production gets its own products, token and webhook at launch.

## Routes

| Route | Purpose |
| --- | --- |
| `POST /billing/checkout` `{ interval: "month" \| "year" }` | Signed-in only. Creates a Polar checkout with `external_customer_id` = our user id; returns `{ url }`. |
| `POST /billing/webhooks/polar` | Verifies the Standard Webhooks signature, logs to `billing_events` (idempotent by `webhook-id`), upserts `entitlements` from `subscription.*` events. |

Polar hosts the customer portal and emails customers a link to it, so there's no app code for
managing or cancelling a subscription.

## Files changed

- `apps/api/src/billing/polar.ts`: field names checked against Polar's 2026-10 OpenAPI spec.
  `paused` now revokes access; cancel-at-period-end is stored as `canceled` so access ends at
  `current_period_end` even if `subscription.revoked` never arrives.
- `apps/api/src/billing/polar.test.ts`: webhook → `BillingEvent` mapping tests.
- `.env` (local, gitignored): `POLAR_PRO_PRODUCT_ID` replaced with the two keys below.

## Env keys

`POLAR_SERVER`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`, `POLAR_PRO_MONTHLY_PRODUCT_ID`,
`POLAR_PRO_YEARLY_PRODUCT_ID`. Deployed stages read them from Secrets Manager
(`fixedstep/<stage>/api`).

The sandbox token has products, checkouts and webhooks scopes, but not discounts.

## Sandbox resources

| Resource | Id |
| --- | --- |
| Fixedstep Pro (Monthly), $20/month | `24210033-7800-4c74-bcdd-a883366cebd5` |
| Fixedstep Pro (Yearly), $200/year | `3001fd04-2d07-46ad-b2b3-99d59584f910` |
| Webhook endpoint | not registered yet (no public URL) |

## Testing locally

1. `pnpm db:up && pnpm dev`, then sign in at http://localhost:5173.
2. Pick monthly or yearly on the home page and start checkout. Pay with the sandbox test card
   `4242 4242 4242 4242` (any future expiry, any CVC). No money moves in sandbox.
3. Without a webhook endpoint, checkout completes in Polar but Pro is **not** granted here.
   To test the full flow, expose the API (e.g. `cloudflared tunnel --url http://localhost:3000`),
   register `<public-url>/billing/webhooks/polar` in the sandbox dashboard (format: raw, API
   version 2026-10, events: `subscription.*`) and put its signing secret in
   `POLAR_WEBHOOK_SECRET`.

## Verify before launch

- [ ] Sandbox end to end: checkout → `entitlements` row `active` → Pro unlocks.
- [ ] Cancel in the portal → `canceled` with `current_period_end`; uncancel → `active`.
- [ ] Pause → access revoked; resume → `active`.
- [ ] Replaying a webhook is a no-op (`duplicate: true`).
- [ ] A bad signature returns 400.
- [ ] Polar rejects checkouts whose `customer_email` domain can't receive mail (422), which
      currently surfaces as a 500. Decide whether to retry without the email.
- [ ] Out-of-order webhooks are last-write-wins (see the NOTE in `routes/billing.ts`). Consider
      comparing `modified_at`.
- [ ] Production: create the live products, a token and a webhook endpoint in the `fixed-step` org,
      fill in the `fixedstep/prod/api` secret, set `POLAR_SERVER=production`.
