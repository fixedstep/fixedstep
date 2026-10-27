# Analytics: product usage, learning metrics, and ops/errors

**Area:** `apps/web`, `apps/api`, `packages/db`, `infra/` (if a hosted or self-hosted tool is
picked).
**Depends on:** nothing.
**Origin:** user request (2026-10-27): there's no analytics of any kind yet.

## Problem

Nothing tells us how the platform is used or whether it's working for learners:

- **Product/usage:** no page views, sign-up or checkout funnels, or retention. Sign-ups and
  purchases are only visible by querying `user` / `entitlements` / `billing_events`.
- **Learning metrics:** `submissions`, `lesson_progress`, `xp_events` and `course_ratings`
  already hold most of the raw data (attempts, passes, completions), but nothing aggregates it.
  Authors can't see which lessons people drop off at, which take the most attempts, or how
  often hints are unlocked.
- **Ops/errors:** frontend exceptions (including `sim` preview worker crashes) and API
  errors and latency only show up in the cloud provider's logs, if at all.

## Suggested approach

Three parts that can ship separately; the designer may split them into their own tasks.

1. **Product analytics.** Pick a privacy-friendly tool that needs no cookie banner (e.g.
   Plausible, Umami or PostHog with cookies off; self-hosted vs. hosted is a cost/infra choice
   for the user). Track page views plus a few named events: sign-up, verified email, course
   start, lesson complete, checkout started/completed. Load it from config so local, e2e and
   staging can turn it off or point elsewhere. Keep the app cloud-neutral (a script tag/HTTP
   endpoint, not a cloud SDK).
2. **Learning metrics.** Server-side aggregates from the existing tables (no new client
   tracking needed): per lesson, starts, completions, median attempts to pass, hint unlocks,
   drop-off between consecutive lessons; per course, completion rate and ratings. Expose them
   to authors, e.g. a `content-cli` command against a stage's DB or an admin-only API route.
   Admin responses must still never include `hiddenTests`, `solution` or quiz `answer`s.
3. **Ops/errors.** Frontend error reporting (window errors, unhandled rejections, worker
   errors) and API error/latency metrics, with PII scrubbed. Prefer something that works the
   same on the GCP and AWS targets (e.g. Sentry or an OpenTelemetry exporter configured from
   env), wired through `infra/src/app-spec.ts`.

## Open questions for the user

- Hosted vs. self-hosted for each part, and the monthly budget.
- Whether anonymous (guest) learners are counted, and the retention period for event data.
- Does the privacy policy or terms need updating?

## Acceptance criteria

- [ ] Product analytics: page views and the named funnel events are recorded on staging and
      prod, are off in local/e2e by default, and set no cookies that need consent.
- [ ] Learning metrics: per-lesson and per-course aggregates are available to authors for a
      chosen stage, computed from existing tables, and covered by tests.
- [ ] Ops/errors: a thrown frontend error and a 500 from the API both show up in the chosen
      tool on staging, with no PII in the payload.
- [ ] Any new infra lands in both the GCP and AWS targets, and its cost is recorded in the
      README.
