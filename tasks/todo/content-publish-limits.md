# Content publish will hit Cloud Run's request size and timeout limits

**Area:** `apps/api/src/routes/internal.ts`, `packages/content-cli/src/sync.ts`,
`infra/src/gcp/service.ts`, `packages/content-cli/template/_github/workflows/publish.yml`
**Origin:** code review of the Pulumi/Cloud Run migration (2026-10-21)

## Problem

The private content repo's CI bundles every course into a single JSON file and POSTs it to
`POST /internal/content` (see the `curl` step in the content template's `publish.yml`). The
endpoint parses the bundle and calls `syncContent`, which upserts everything in **one
transaction**.

This runs into two Cloud Run limits:

1. **Request size.** Cloud Run's front end rejects HTTP/1 request bodies over **32 MiB** with a
   413, before the app sees them. The app's `bodyLimit` is set to 50 MB, so that check never
   applies. The workflow's `curl --retry 3 --retry-all-errors` then retries the 413 three times
   for nothing.
2. **Request timeout.** The API service is deployed with `timeout: "30s"` in
   `infra/src/gcp/service.ts`, and that setting also applies to the grader. `syncContent` runs
   sequential per-row upserts. Once there are many courses, chapters and lessons, the sync can
   run past 30s. The request is then cut off mid-transaction: it rolls back, and publishing
   fails.

Neither limit matters at today's content size. Both will eventually break publishing as
courses grow. The old S3 → Lambda path had neither limit.

**On AWS** (`aws-<stage>` stacks), requests come in through an API Gateway HTTP API
(`infra/src/aws/ingress.ts`). Its limits are stricter: **10 MB** request bodies and a **30s**
integration timeout, and neither can be raised. Whatever fix is chosen has to fit under 10 MB
per request, which favors option A (one course per request). The 30s ceiling also means
"give the API a longer timeout" doesn't help on AWS, so faster `syncContent` (batched inserts)
matters more there.

## Suggested approach

Pick one of these and note the choice here.

- **A. Send one course per request (smallest change).** Sync is already per course: courses
  missing from a sync are left alone, as `sync.ts` documents. Change the `bundle` CLI and
  `publish.yml` to emit and POST one bundle per course. Each request stays small and fast. Each
  course commits atomically on its own, but the whole publish is no longer atomic.
- **B. Upload the bundle to object storage and send a pointer.** CI uploads the bundle to a
  bucket and POSTs its location, and the API fetches it. This brings back cloud-specific code,
  so it must stay behind an interface: CLAUDE.md requires no cloud SDKs in `apps/` or
  `packages/`. It's more work. Only worth it if single courses get close to 32 MiB.
- **Also, whichever option you pick:**
  - Lower `bodyLimit` in `internal.ts` to just under 32 MiB (e.g. 30 MiB), so oversized bundles
    get a clear app-level 413 that names the limit.
  - Give the API a longer timeout than the grader. Make `timeout` a `ServiceArgs` field in
    `service.ts` instead of hard-coding 30s. The API could use 120–300s and the grader keeps 30s.
  - Speed up `syncContent` by batching inserts per chapter (multi-row
    `insert … onConflictDoUpdate`) instead of one round-trip per lesson.
  - In `publish.yml`, stop retrying 4xx: drop `--retry-all-errors`, or check the status code.

## Acceptance criteria

- [ ] Publishing works for a bundle larger than 32 MiB, or for a large multi-course content
      set, depending on the option chosen.
- [ ] Oversized requests fail fast with a clear message, and CI does not retry them.
- [ ] Each service's timeout is configured separately, and the API's is long enough for a
      realistic sync.
- [ ] `apps/api/src/routes/internal.test.ts` and the content-cli tests cover the new behavior.
- [ ] Any `publish.yml` change is also made in `packages/content-cli/template/` (dotfiles are
      stored as `_name`) and noted for existing content repos.
