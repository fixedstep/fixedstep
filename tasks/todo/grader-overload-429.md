# Grader overload returns 500s to students

**Area:** `apps/api/src/lib/grader.ts`, `infra/src/gcp/index.ts`, `infra/src/aws/index.ts`,
`infra/src/aws/service.ts`, `infra/src/config.ts`
**Origin:** code review of the Pulumi/Cloud Run migration (2026-10-21); AWS notes added the same
day after the AWS target was built.

The overload behavior differs by cloud, so the fix has to cover both (see "On AWS" below).
Either cloud can run a stage (stacks are `<cloud>-<stage>`).

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

### On AWS

The grader runs on ECS Fargate (`fargateService("grader", …)` in `infra/src/aws/index.ts`). The
API reaches it through Cloud Map DNS, with no load balancer or concurrency cap in between, so
nothing returns 429. Instead, all requests land on the running tasks: at least 1, scaled on CPU
up to `config.grader.maxInstances`. Node accepts them all, and QuickJS runs block the event loop
one after another, so requests **queue inside the process**. Under a burst:

- Latency grows with queue depth (≈3s per queued run), and requests start hitting the API's
  20s `AbortSignal.timeout` in `createGrader`. That surfaces as an `AbortError` → 500, the same
  user-facing symptom as on GCP.
- CPU target tracking (60%, 1-minute metrics) takes a few minutes to add tasks. Staging also
  runs on Fargate Spot, where a reclaimed task drops its in-flight requests (connection reset).

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
5. **AWS: put a bound on the queue.** Have the grader itself (`apps/grader/src/app.ts`) reject
   work it can't start soon. Track in-flight runs and return **429** once more than N are
   waiting (e.g. N = 2). Then both clouds produce the same signal, and the client retry from
   step 1 handles both. Treat a timeout or connection reset like a 429 too (retry once while
   the deadline allows). This keeps the app cloud-neutral, so no AWS-specific code.
6. **AWS: scale on load, not CPU.** Optionally, publish an in-flight/queue-depth metric, or use
   a step-scaling policy with a shorter period, so tasks are added before the queue builds up.
   Consider `minTasks: 2` for the prod grader, and on-demand capacity for at least one staging
   grader task if Spot interruptions get in the way of testing.

## Acceptance criteria

- [ ] A grader 429/503 is retried with backoff, bounded by the overall timeout.
- [ ] When retries run out, the API returns 503 with a clear message, not 500.
- [ ] Unit tests in `apps/api` cover: success after one 429, exhausted retries → 503, and no
      retry on other 4xx (stub `fetch`).
- [ ] The web UI shows a "busy, try again" state for 503.
- [ ] Any infra concurrency/instance changes are written up with their cost impact.
- [ ] On AWS, a burst larger than the running grader capacity gets bounded latency and a 503
      "busy" response, not 20s hangs that end in 500s. The grader returns 429 when its queue is
      full, and an interrupted Spot task's request is retried.
- [ ] Load-tested on both `gcp-staging` and `aws-staging` (whichever is up), and results noted
      here.
