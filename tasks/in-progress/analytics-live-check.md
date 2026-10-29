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

## Progress

- 2026-10-29: shared US PostHog project created (Product analytics; autocapture, heatmaps and
  web vitals off in onboarding). Checked locally with `APP_STAGE=local`: `/api/config` serves
  the key; Live events showed only `$pageview`, `$identify`, `sign_up`, `email_verified`,
  `course_started` and `lesson_completed`, each with `stage=local`, URLs without query strings,
  and people as opaque ids only. The guest's pre-sign-up events merged into the identified
  person. Each full page load starts a new anonymous id, then `$identify` (in-memory
  persistence, expected). `checkout_*` not exercised.
- `posthogKey` set in `Pulumi.aws-staging.yaml` and `Pulumi.aws-prod.yaml` (public key; prod
  applies on the next `v*` tag). Staging deploys on merge; the staging and prod live checks,
  `pnpm infra preview` and the admin grant follow.

## Acceptance criteria

- [ ] `pnpm infra preview` is clean apart from the expected env vars on one GCP and one AWS
      stack.
- [ ] Page views and the named funnel events reach the shared PostHog project tagged
      `stage=staging` from staging, with no PII or query strings.
- [ ] The same from prod, tagged `stage=prod`.
