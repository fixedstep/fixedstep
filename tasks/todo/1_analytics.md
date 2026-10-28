# Analytics: product usage and learning metrics

**Area:** `apps/web`, `apps/api`, `packages/content-cli`, `infra/` (config/env only).
**Depends on:** nothing.
**Origin:** user request (2026-10-27): there's no analytics of any kind yet. Error and latency
tracking was split out into task `error-tracking`.

## Problem

Nothing tells us how the platform is used or whether it's working for learners:

- **Product/usage:** no page views, sign-up or checkout funnels, or retention. Sign-ups and
  purchases are only visible by querying `user` / `entitlements` / `billing_events`.
- **Learning metrics:** `submissions`, `lesson_progress`, `xp_events` and `course_ratings`
  already hold most of the raw data (attempts, passes, completions), but nothing aggregates it.
  Authors can't see which lessons people drop off at, which take the most attempts, or how
  often hints are unlocked.

## Decisions (user, 2026-10-27)

- **Product analytics: hosted PostHog, cookies off** (`persistence: "memory"` or equivalent,
  so no consent banner is needed). It has funnels and retention, and its free tier (about 1M
  events/mo when checked) covers current traffic. Hosted Plausible is the fallback if only
  page views and a basic funnel are wanted. Self-hosting was ruled out: PostHog self-hosted needs
  ClickHouse and Kafka, and the only light option (Umami on Postgres) means adding a service to
  both the GCP and AWS stacks.
- **Learning metrics: built in-house** from the existing tables. No third-party tool, so we
  don't duplicate data we already have or send lesson internals out.
- Recheck PostHog's pricing and free tier before starting; the figures above are from memory.

## Suggested approach

1. **Product analytics (PostHog).**
   - Config: a public project key and host (EU or US region) passed to the web app at build or
     runtime config. Unset means off, which is the default for local, e2e and CI. Staging and
     prod each get their own PostHog project. Add the values to `infra/src/app-spec.ts` so both
     cloud targets set them. No cloud SDKs; the PostHog JS snippet/library isn't a cloud SDK.
   - Track page views (SPA route changes) and named events: sign-up, email verified, course
     start, lesson complete, checkout started, checkout completed. Fire checkout completed from
     the confirmed state the app already has, not optimistically.
   - Identify signed-in users by an opaque id only: no email or name. Guests stay anonymous.
   - Optional: proxy through our own domain so ad blockers don't drop events.
2. **Learning metrics (in-house).** Server-side aggregates from existing tables, with no new
   client tracking: per lesson, starts, completions, median attempts to pass, hint unlocks, and
   drop-off between consecutive lessons; per course, completion rate and ratings. Expose them
   to authors, e.g. a `content-cli` command against a stage's DB or an admin-only API route.
   Admin responses still never include `hiddenTests`, `solution` or quiz `answer`s.

## Open questions for the user

- PostHog region (EU vs US).
- Whether guest learners are counted, and the event retention period.
- Privacy policy/terms update to name PostHog as a processor.

## Acceptance criteria

- [ ] Product analytics: page views and the named funnel events reach the stage's PostHog
      project on staging and prod; analytics is off when the key is unset (local, e2e, CI), and
      no cookies or local storage that need consent are set.
- [ ] No email, name or other PII is sent to PostHog; users are identified by an opaque id.
- [ ] Learning metrics: per-lesson and per-course aggregates are available to authors for a
      chosen stage, computed from existing tables, and covered by tests.
- [ ] Config lands in both the GCP and AWS targets, and the PostHog plan/cost is recorded in the
      README.
