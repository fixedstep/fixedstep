# Tune grader capacity and scaling for real traffic

**Area:** `infra/src/config.ts`, `infra/src/gcp/index.ts`, `infra/src/aws/index.ts`,
`infra/src/aws/service.ts`, `apps/grader/src/app.ts`
**Origin:** split out of `grader-overload-429` (2026-10-22). That task fixed the app side: the
API retries a busy grader and returns 503, and the grader returns 429 once more than 2 runs are
queued. It left infra unchanged on purpose.

## When to pick this up

Leave this until there's evidence it's needed:
- `[grader] busy:` warnings in the API logs, or 503s on `POST /api/lessons/:id/submit`, show up
  under normal traffic, not only in a deliberate burst test.
- Students report "Grader is busy" during a class or launch.
- A planned traffic spike (course launch, a class signing up together).

## Current settings

| | GCP (Cloud Run) | AWS (Fargate) |
|---|---|---|
| Per instance/task | 1 vCPU, 512 MiB, `concurrency: 1` | 0.25 vCPU, 512 MiB, Spot in both stages |
| Min | `minInstances: 0` (cold starts) | `minTasks: 1` |
| Max | `config.grader.maxInstances`: staging 5, prod 20 | same value as `maxTasks` |
| Scaling | Cloud Run request-based | CPU target tracking at 60%, 1-minute metrics |
| Overload signal | Cloud Run 429 when all instances are busy | grader's own 429 once the queue (`maxQueued`, default 2) is full |

## Options

Measure first (see "Load test"), then pick the cheapest change that removes the 503s.

1. **Raise `maxInstances`** in `infra/src/config.ts` (both clouds read it). This only costs
   anything while instances are actually running, so it's the cheapest change. Do staging first.
2. **GCP `minInstances: 1` for prod** (`infra/src/gcp/index.ts`). This removes cold starts for
   the first submissions after an idle period, but bills one always-on instance.
3. **GCP `concurrency` above 1.** QuickJS runs block the event loop, so a second request to the
   same instance only waits in that instance's queue. With `concurrency: 2–3`, the grader's own
   `maxQueued` becomes the cap that matters. That could help with cold starts, but it doesn't add
   throughput. Only worth trying together with the load test.
4. **AWS: scale on load, not CPU** (`infra/src/aws/service.ts`, the `aws.appautoscaling.Policy`).
   With 0.25 vCPU, CPU tracking reacts in minutes. Options:
   - a step-scaling policy on a shorter period;
   - a custom in-flight/queue-depth metric published by the grader. Do this through stdout
     (CloudWatch embedded metric format) so `apps/` stays cloud-neutral.
5. **AWS grader sizing** (`AWS_STAGE` in `infra/src/aws/index.ts`):
   - `minTasks: 2` for prod;
   - more CPU per task (512), so each run finishes faster;
   - on-demand instead of Spot for at least one task. A Spot reclaim drops in-flight runs; the
     API retries them once.
6. **Grader `maxQueued`.** If retries keep hitting full queues, try a smaller queue (1). Then a
   burst fails over to another instance faster and spends less time waiting.

## Cost impact

Write this up before applying anything to prod. For each option, give the monthly delta per
stage. Use the GCP/AWS pricing calculators with the region in use (AWS is us-east-2), and check
the result against `budgetUsd` in `AWS_STAGE` (staging 30, prod 50). GCP has no budget alert in
infra yet; check the billing account's budget, or add one in `infra/src/gcp/` as part of this task.
The always-on options (2, and the on-demand/`minTasks` parts of 5) are the ones that move the
bill.

## Load test

Run against whichever staging stack is up (`gcp-staging`, `aws-staging`):
- Fire N concurrent code submissions at a free code lesson, stepping N past capacity
  (e.g. 5, 10, 20). Record p50/p95 latency and the counts of 200/503/500.
- On AWS, also stop a grader task in the middle of a burst to simulate a Spot reclaim, and check
  that the affected submission is retried rather than failing.

## Acceptance criteria

- [ ] Load-test results for the current settings recorded here, for each cloud tested.
- [ ] On AWS, a burst larger than capacity gets bounded latency and 503 "busy", not 20s hangs
      or 500s, and a submission hit by a Spot reclaim is retried.
- [ ] The chosen changes are written up with their cost impact per stage before prod is
      changed.
- [ ] After the changes, the load test shows no 503s at the expected peak, and GCP and AWS are
      changed together (see CLAUDE.md).
