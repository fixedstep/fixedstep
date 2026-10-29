# Analytics: confirm PostHog events arrive from staging and prod

**Area:** `infra/` (Pulumi config only), PostHog project settings.
**Depends on:** `analytics` (merged).
**Origin:** split from task `analytics` (2026-10-28): its live-delivery check and the infra
preview can only run after merge and deploy.

## Problem

The `analytics` branch adds PostHog product analytics and the `posthogKey` / `posthogHost`
Pulumi config, all covered by unit and e2e tests with analytics off. Nobody has yet confirmed
that events reach the shared PostHog project from a deployed stage, or previewed the infra
change on a real stack.

## Steps

The full steps are the "Post-merge check (lead)" section of `tasks/complete/analytics.md`:

1. Run `pnpm infra preview` on one stack of each cloud (e.g. `gcp-staging` and `aws-staging`).
   Expect only the new env vars (`APP_STAGE`, plus `POSTHOG_KEY`/`POSTHOG_HOST` once set) and
   no other resource changes.
2. Create the shared US PostHog project and apply the project settings in the README. Then
   `pnpm infra config set -s <cloud>-staging posthogKey …` (and `posthogHost`), and deploy.
3. Grant the first admin with the README SQL and open `/api/admin/metrics`.
4. In PostHog Live events, confirm `$pageview` and a sign-up from staging carry
   `stage=staging`, and no email, name or query strings (`?token=`, `?redirect=`,
   `?checkout=`). Confirm the network tab shows no `/flags` request. Apply the test-account
   filter.
5. Repeat the config and check for prod after the first prod release.

## Acceptance criteria

- [ ] `pnpm infra preview` is clean apart from the expected env vars on one GCP and one AWS
      stack.
- [ ] Page views and the named funnel events reach the shared PostHog project tagged
      `stage=staging` from staging, with no PII or query strings.
- [ ] The same from prod, tagged `stage=prod`.
