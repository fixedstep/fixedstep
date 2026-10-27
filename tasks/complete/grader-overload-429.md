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

- [x] A grader 429/503 is retried with backoff, bounded by the overall timeout.
- [x] When retries run out, the API returns 503 with a clear message, not 500.
- [x] Unit tests in `apps/api` cover: success after one 429, exhausted retries → 503, and no
      retry on other 4xx (stub `fetch`).
- [x] The web UI shows a "busy, try again" state for 503.
- [x] The grader returns 429 when its queue is full, and a request that times out or hits a
      connection reset (e.g. an interrupted Spot task) is retried once.

Infra capacity changes, the cost write-up, the live AWS burst/Spot check and the staging load
tests moved to task `grader-capacity-tuning`.

## Plan

### Scope

Covered on this branch (app-level, cloud-neutral):

- 429/503 retried with jittered backoff under one shared 20s deadline (AC 1).
- Retries exhausted → API 503 with a clear message (AC 2), unit-tested with stubbed `fetch` (AC 3).
- Web "busy, try again" state for 503 (AC 4).
- The grader bounds its own queue and returns 429; a connection reset or per-attempt timeout is
  retried once while the deadline allows (the app half of AC 6).

**Moved to task `grader-capacity-tuning`:** suggested-approach items 3 and 6, the cost
write-up, the staging load tests, and the live AWS burst/Spot check. No `infra/` or app-spec edits
on this branch.

### Changes

1. **`apps/api/src/lib/grader.ts`**
   - `export class GraderBusyError extends Error` (`name = "GraderBusyError"`).
   - Move the http branch into an exported, testable factory:
     ```ts
     export type HttpGraderOptions = {
       url: URL; token: string;
       deadlineMs?: number;        // 20_000: a single budget shared by all attempts
       attemptTimeoutMs?: number;  // 12_000: lets a hung attempt be retried once
       maxAttempts?: number;       // 3
       sleep?: (ms: number) => Promise<void>; // injectable for tests
       random?: () => number;      // injectable jitter
     };
     export function createHttpGrader(opts: HttpGraderOptions): Grader;
     ```
     `createGrader(env)` keeps its signature and calls this in http mode.
   - Loop: create `const deadline = AbortSignal.timeout(deadlineMs)` once. Each attempt uses
     `AbortSignal.any([deadline, AbortSignal.timeout(attemptTimeoutMs)])` (Node 24 has it).
     - 2xx: return the JSON.
     - 429 or 503: retryable, up to `maxAttempts`.
     - A network error (`TypeError` from fetch, e.g. ECONNRESET/socket hang up), or an attempt
       timeout while `deadline` hasn't aborted: retryable **once** in total (a `transportRetried`
       flag), still bounded by `maxAttempts`.
     - Any other non-2xx: `throw new Error("grader failed: …")` as today. No retry, so it stays
       a 500.
     - `deadline.aborted`: throw `GraderBusyError`.
   - Backoff before attempt n+1: `base = [250, 1000][n-1] ?? 1000`, `delay = base * (0.5 +
     random()/2)`. If `delay` won't fit in the remaining deadline (track `start = Date.now()`),
     skip it and throw `GraderBusyError` straight away. Retries exhausted → `GraderBusyError`
     (keep the last status in the message for logs).
   - Drain or cancel the body of a retried response (`await res.body?.cancel()`) so sockets
     don't leak.
2. **`apps/api/src/routes/lessons.ts`**: wrap the `await grader({...})` call:
   ```ts
   try { grade = await grader({...}); }
   catch (e) {
     if (e instanceof GraderBusyError)
       return c.json({ error: "Grader is busy, try again in a moment" }, 503,
                     { "retry-after": "5" });
     throw e;
   }
   ```
   This returns before `db.insert(submissions)` and `completeLesson`, so no submission row and
   no XP. `SubmitResponse` and the other DTOs are unchanged.
3. **`apps/grader/src/queue.ts`** (new): a pure in-flight limiter.
   ```ts
   export type RunQueue = { tryAcquire(): (() => void) | null; run<T>(fn: () => Promise<T>): Promise<T> };
   export function createRunQueue(opts: { concurrency: number; maxQueued: number }): RunQueue;
   ```
   - `tryAcquire` runs **synchronously at handler entry**. It returns `null` once
     `active + waiting >= concurrency + maxQueued`. Otherwise it returns a release function.
   - `run` starts each job via `setImmediate` once a slot frees up.

   Why the queue is needed: `vm.evalCode` in `packages/test-harness/src/quickjs.ts` is
   synchronous and blocks the event loop. A plain counter around `await run()` would see each
   request alone and never reject anything. Deferring with `setImmediate` (the check phase) lets
   the poll phase take in every request that arrived during a blocking run, and reject the
   overflow, before the next run starts.
4. **`apps/grader/src/app.ts`**
   - Add `maxQueued?: number` (default 2) to `GraderOptions` and build
     `createRunQueue({ concurrency: 1, maxQueued })`.
   - In `/grade`, after the token check and before the body parse: `const release =
     queue.tryAcquire(); if (!release) return c.json({ error: "busy" }, 429)`.
   - Wrap the parse and the run in `try { … return c.json(await queue.run(() => run(parsed.data))) }
     finally { release() }`. A 400 also releases its slot.
   - No env var or app-spec change. `server.ts` is unchanged.
5. **`apps/web/src/lib/submit-error.ts`** (new): `export function submitErrorMessage(err:
   unknown): string`. It returns "The grader is busy right now. Try again in a moment." for
   `ApiError` with status 503, and "Submission failed. Try again." otherwise.
6. **`apps/web/src/pages/LessonPage.tsx`**: in `SubmitStatus`, replace the hard-coded error line
   with `<p className="error" role="status">{submitErrorMessage(submit.error)}</p>`. Resubmitting
   already works: `submit.isPending` is false after the error, so the Submit button and ⌘⇧↵ are
   live again. No auto-retry in the browser.

Optional (not required by the AC, so left out unless asked): map the existing 429 "slow down"
from `submitLimit` to its own message in `submitErrorMessage`.

### Tests

The root `vitest.config.ts` picks up `apps/*/src/**/*.test.ts`.

- **`apps/api/src/lib/grader.test.ts`** (new). Use `vi.stubGlobal("fetch", vi.fn())`, a no-op
  `sleep`, and `random: () => 0`, with `createHttpGrader({ url: new URL("http://grader/grade"),
  token })`. Cases:
  - 429 then 200 → resolves to the result; fetch called twice.
  - 503 ×3 → rejects with `GraderBusyError`; fetch called 3 times.
  - 400 (and 401) → rejects with a plain `Error`, not `GraderBusyError`; fetch called once.
  - fetch rejects with `TypeError("fetch failed")` once, then 200 → resolves.
  - Two `TypeError`s in a row → `GraderBusyError` (transport retry happens only once).
  - Shared deadline: `deadlineMs: 50` with a fetch that never resolves until its signal aborts →
    `GraderBusyError` in about 50ms, not 50ms × attempts.
  - Backoff delays passed to `sleep` stay inside the [125, 250] and [500, 1000] ranges.
- **`apps/api/src/routes/lessons.test.ts`** (new; no route test exists yet). Follow
  `internal.test.ts` / `billing.test.ts`:
  - Setup: `createTestDb()`, seed `content-sample` through
    `internalRoutes(...).request("/content")` exactly as `internal.test.ts` does, and insert
    user `u1`.
  - Mount `lessonRoutes({ db, grader } as never)` behind a tiny Hono middleware that does
    `c.set("user", { id: "u1" } as never)`.
  - Submit to the free code lesson `moving-with-delta-time` (look up its id by slug).
  - Cases: a grader that throws `GraderBusyError` → 503 with
    `{ error: /busy/ }`, a `retry-after` header, and zero `submissions` rows for `u1`. A grader
    that throws a plain `Error` → the error propagates (500 is mapped in `app.ts`).
- **`apps/grader/src/queue.test.ts`** (new):
  - With `concurrency 1, maxQueued 2`, the 4th `tryAcquire` returns `null`.
  - Calling a release frees a slot.
  - Jobs run one at a time and in order.
- **`apps/grader/src/app.test.ts`** (extend):
  - With `maxQueued: 1` and a `grade` stub that waits on a manually resolved promise, fire 3
    posts at once → exactly one is 429 (`{ error: "busy" }`).
  - After resolving, the others are 200, and a new post is 200 (slots released).
  - A 400 (malformed body) doesn't leak a slot.
- **`apps/web/src/lib/submit-error.test.ts`** (new, pure like `redirect.test.ts`): 503
  `ApiError` → the busy message; 500 `ApiError` and a plain `Error` → the generic message.

### Risks

- **CLAUDE.md invariants:**
  - XP is still written only via `completeLesson` after grading. The 503 returns before
    `submissions` and XP are written.
  - The new 503 body is a fixed string: no hidden tests, solution or answers.
  - No cloud SDKs or cloud-specific code. The 429 signal comes from the app, so behavior matches
    on GCP and AWS.
  - `harnessRuntime` is untouched.
- Retrying is safe because grading is stateless and the API writes nothing until the grade
  returns. Worst case, one submission costs up to 3 grader runs. The per-user `submitLimit` (20
  per minute) still caps how much load a client can add.
- **Timing budget:** a queued request waits up to (1 + `maxQueued`) × ~3s, plus a cold start,
  before it runs. With `maxQueued` 2, that's about 9s plus the cold start. The 12s attempt
  timeout covers it and leaves room for one retry inside 20s. If staging shows longer cold
  starts, tune `attemptTimeoutMs` rather than the overall deadline.
- **Leftover work after a timeout:** when an attempt times out, the grader may still finish that
  run. The retry then adds one more run, which the bounded queue absorbs.
