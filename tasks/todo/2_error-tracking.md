# Error tracking: frontend and API errors, then latency metrics

**Area:** `apps/web` (including `apps/web/src/workers/`), `apps/api`, `apps/grader`, `infra/`.
**Depends on:** nothing.
**Origin:** split out of task `analytics` (2026-10-27).

## Problem

Frontend exceptions (including crashes in the `sim` preview worker) are never reported.
API errors and latency only show up in the cloud provider's logs, if at all. A broken deploy or
a lesson that crashes the preview would only come to light through user complaints.

## Decisions (user, 2026-10-27)

- **Errors: hosted Sentry.** The free tier (about 5k errors/mo when checked) covers current
  traffic, and it gives source-mapped frontend stack traces. A hosted tool also keeps reporting
  when our own stack is down. Self-hosted Sentry is far too heavy (Kafka, ClickHouse, dozens of
  containers). **Fallback: GlitchTip** (Sentry-protocol compatible, on Postgres) if keeping
  error data in our own account becomes a requirement.
- **Latency metrics: later, via OpenTelemetry.** The app emits OTLP. Each cloud's exporter and
  backend lives in `infra/src/<cloud>/`: CloudWatch on AWS, Cloud Monitoring on GCP, or
  Grafana Cloud for both.
- Recheck Sentry's pricing and free tier before starting; the figures above are from memory.

## Suggested approach

1. **Sentry, frontend:** init from a DSN in config (unset means off: local, e2e, CI). Capture
   window errors, unhandled rejections, and errors from the preview worker. Make sure errors
   thrown by learner code in `sim` lessons aren't reported as platform errors. Upload source
   maps from the `apps/web` build in CI. Set release = platform version and environment =
   stage.
2. **Sentry, API and grader:** capture unhandled errors and 5xx responses in `apps/api`, plus
   grader failures that aren't test failures. A failing learner submission is not an error.
3. **PII scrubbing:** no emails, names, cookies or auth headers, and no submission source code
   in event payloads (`beforeSend` plus server-side scrubbing settings).
4. **Config:** a DSN per stage in `infra/src/app-spec.ts`, mapped by both the GCP and AWS
   targets. The Sentry SDK is a vendor SDK, not a cloud SDK, so `apps/` stays cloud-neutral.
5. **Later (can be its own follow-up):** OTel request latency and error-rate metrics for the
   API, with alerting.

## Acceptance criteria

- [ ] A thrown frontend error, a preview-worker crash and an API 500 each show up in the stage's
      Sentry project on staging, with readable source-mapped stack traces.
- [ ] Errors in learner code and failing submissions are not reported.
- [ ] No PII or submission source in event payloads (checked on a captured event).
- [ ] Off when the DSN is unset (local, e2e, CI). Config is in both the GCP and AWS targets, and
      the Sentry plan/cost is recorded in the README.
- [ ] Latency metrics via OTel: done, or split into its own task.
