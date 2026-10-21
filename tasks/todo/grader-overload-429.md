# Grader overload returns 500s to students

**Area:** `apps/api/src/lib/grader.ts`, `infra/src/gcp/index.ts`, `infra/src/config.ts`
**Origin:** code review of the Pulumi/Cloud Run migration (2026-10-21)

## Problem

The grader runs on Cloud Run with `concurrency: 1` (one submission per instance, see
`infra/src/gcp/index.ts` → `cloudRunService("grader", …)`) and `minInstances: 0`. Instances are
capped by `maxInstances` in `infra/src/config.ts`: 5 for staging and 20 for prod.

When every instance is busy, or new ones are still cold-starting, Cloud Run rejects the extra
requests with **429**. Lambda used to scale concurrency on its own, so this didn't happen before.
`createGrader` in `apps/api/src/lib/grader.ts` turns any non-2xx response into
`throw new Error("grader failed: 429 …")`. The submit route
(`apps/api/src/routes/lessons.ts`, the `await grader({...})` call) doesn't catch that, so the
learner gets a generic 500.

To reproduce, send 6+ code submissions at once against staging.

## Suggested approach

1. **Retry with backoff in the client.** In `createGrader`, retry on 429 (and 503, which Cloud
   Run also returns during cold-start pressure). Use something like 3 attempts with jittered
   backoff (250ms → 1s), and keep the whole thing inside the existing 20s `AbortSignal.timeout`.
   Use a single deadline for all attempts, not a fresh timeout per attempt. Don't retry other
   4xx responses.
2. **Return a clear error when retries run out.** Throw a typed error (e.g. `GraderBusyError`)
   that the submit route maps to **503** with a friendly message ("Grader is busy, try again in a
   moment") instead of a 500. No submission row is written in this case, which is correct:
   nothing was graded.
3. **Optional: revisit the capacity settings.** Consider whether `concurrency: 1` is required.
   QuickJS runs are isolated per request inside one process, so 2–4 per instance might be safe
   if memory allows (512 MiB today). Measure before changing it. Also consider raising
   staging's `maxInstances`, or `minInstances: 1` for prod to cut cold starts (that adds cost).
4. The web client should show the 503 message and let the student resubmit. Check how
   `apps/web` currently handles a failed submit.

## Acceptance criteria

- [ ] A grader 429/503 is retried with backoff, bounded by the overall timeout.
- [ ] When retries run out, the API returns 503 with a clear message, not 500.
- [ ] Unit tests in `apps/api` cover: success after one 429, exhausted retries → 503, and no
      retry on other 4xx (stub `fetch`).
- [ ] The web UI shows a "busy, try again" state for 503.
- [ ] Any infra concurrency/instance changes are written up with their cost impact.
