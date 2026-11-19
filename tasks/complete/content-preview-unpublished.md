# Preview unpublished courses in local dev

**Area:** `packages/content-cli` (`cli.ts` `dev`, `sync.ts`), root `package.json` scripts,
README "Writing course content".
**Depends on:** nothing.
**Origin:** user request (2026-10-28), for the `game-engine` playthrough.

## Problem

A course with `published: false` is hidden everywhere: `apps/api/src/routes/courses.ts` and
`lessons.ts` filter on `courses.published = true`, and there is no preview mode. To play an
unfinished course locally, an author has to edit `published: true` into `course.yaml` and
remember not to commit it. There is also no single short command for the local content loop.

## Proposal (designer to confirm)

- **Preview flag in the CLI:** `content:dev` (and optionally `content:sync`) takes `--preview`
  (or a `CONTENT_PREVIEW=1` env var), which syncs every course as `published: true` in the
  local database only. `validate`/`bundle` and the publish workflow ignore it, so staging and
  prod still honour `course.yaml`.
- **Guard:** refuse `--preview` unless `DATABASE_URL` points at a local host (localhost,
  `postgres` on the compose network), so it can never publish a draft to a shared database.
- **Short command:** add a root script, e.g. `pnpm content:preview` →
  `content:dev --preview`, and document it in the README next to `content:dev` (with the
  `scripts/in-docker.sh` form). A Makefile is optional; the repo has none today, so prefer a
  pnpm script unless the user wants `make`.
- **Afterwards:** a normal `content:sync`/`content:dev` puts the real `published` values back.

No API change: the routes keep filtering on `published`, so nothing new reaches learners.

## Acceptance criteria

- [x] `scripts/in-docker.sh pnpm content:preview` shows `published: false` courses in the local
      app and re-syncs on save. Checked in the dev container (no Docker there, so `pnpm
      content:preview` directly, against a scratch DB and a copy of `content-sample/` set to
      `published: false`): a plain `content:sync` left `/api/courses` empty; under preview the
      course appeared on the home page in headless Chromium; a title edit in `course.yaml`
      re-synced and showed in the page; a plain `content:sync` afterwards hid it again. The
      `in-docker.sh` form runs the same script with host `postgres`, which the guard accepts.
- [x] Preview mode is refused against a non-local `DATABASE_URL`; `bundle` and the publish
      workflow are unaffected.
- [x] Unit tests for the flag (the sync uses `published: true` only in preview) and the guard.
- [x] README documents the command.

**Outcome note:** the guard ended up stricter than the plan below. postgres.js 3.4.9 dials the
URL hostname and ignores `?host=`, so the URL hostname must always be local; a `?host=` must
additionally be one local value or socket path. URLs with `hostaddr`/`port`/`service` params,
a comma or more than one `@` in the authority are refused.

## Plan

**Scope:** all four acceptance criteria are covered on this branch, and none are deferred. No
infra, app-spec, API, DTO or cost changes. The first criterion (the course shows up in the
running app and re-syncs on save) is checked by hand. `dev` already re-syncs on save, so preview
only changes the value that gets synced.

**Changes to the Proposal:**
- **Flag only, no `CONTENT_PREVIEW` env var.** The `start` script loads the root `.env`
  (`tsx --env-file-if-exists=../../.env`). If an author put `CONTENT_PREVIEW=1` there, every
  `content:sync`/`content:dev` would quietly become a preview. A flag on the command line is
  explicit, and the root script means nobody has to type it.
- **Leave `syncContent` alone.** Preview is a pure transform in the CLI, applied before
  `syncContent` is called. `apps/api/src/routes/internal.ts` (the publish workflow's
  `POST /internal/content`) and `e2e/support/start-api.ts` call `syncContent` directly. They
  can't reach the transform, so publishing to staging/prod still uses `course.yaml`. The
  transform can also be unit-tested without a database.
- `--preview` is accepted by `dev` and `sync`. `validate`, `bundle`, `new` and `init` reject it
  with the usage error (exit 2), so nobody can think a bundle was built in preview.

### Changes (in order)

1. **New `packages/content-cli/src/preview.ts`** (pure, no I/O):
   - `export const PREVIEW_FLAG = "--preview";`
   - `export function splitPreviewFlag(argv: string[]): { preview: boolean; args: string[] }`
     sets `preview` if any element is `--preview`, and returns `args` with every `--preview`
     removed. The flag can go anywhere, so `pnpm content:preview ../dir` works: pnpm appends
     `../dir` after `dev --preview`.
   - `export const LOCAL_DB_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "postgres"]);`
     Use `[::1]` with brackets, because that's what WHATWG `URL.hostname` returns for IPv6.
   - `export function isLocalDatabaseUrl(url: string): boolean`. The rule fails closed:
     - parse with `new URL(url)`; if it throws (for example a multi-host URL), return false.
     - if the `host` query parameter is set (libpq/postgres.js style, as in
       `?host=/abs/socket/dir`), it overrides the hostname. It counts as local only if it
       starts with `/` (a unix socket) or is in `LOCAL_DB_HOSTS`.
     - otherwise the hostname, lower-cased, must be in `LOCAL_DB_HOSTS`. An empty hostname is
       **not** local, because postgres.js would fall back to `PGHOST`, which could be anything.
     - no DNS lookups and no wildcard `127.*`. The ports and database names are left alone, so
       `fixedstep_e2e` and port 5433 still work.
     - Which hosts this lets through: the compose network (`scripts/in-docker.sh`, the compose
       `node-env`) uses host `postgres`, which is allowed. The dev container
       (`.devcontainer/docker-compose.yml`) and the host's `.env.example` use `localhost`, which
       is allowed. A Cloud SQL or RDS hostname, or an IP other than loopback, is refused.
   - `export function assertPreviewDatabase(url: string | undefined): void` throws
     `Error("--preview only runs against a local database (localhost, 127.0.0.1, ::1 or the compose \"postgres\" host); DATABASE_URL host is <host>")`
     if `!url` or `!isLocalDatabaseUrl(url)`. The message prints only the host (or `unset` /
     `unparseable`), **never the full URL**, because the URL contains the password.
   - `export function asPreview(courses: LoadedCourse[]): LoadedCourse[]` returns
     `courses.map((c) => ({ ...c, published: true }))`, a shallow copy that leaves its input
     unchanged.
2. **`packages/content-cli/src/cli.ts`:**
   - `main()`: `const { preview, args } = splitPreviewFlag(process.argv.slice(2)); const [command, arg, arg2] = args;`.
     If `preview && command !== "dev" && command !== "sync"`, call `usage()`.
   - `openDb(preview = false)`: after the `DATABASE_URL is required` check, call
     `if (preview) assertPreviewDatabase(url);` **before** `createDb`, so a refused URL is never
     connected to. `main().catch` already prints the error and exits 1.
   - `dev(dir, preview)`: `openDb(preview)` is already the first statement, so the guard runs
     before the watcher starts. In `run`, call `syncContent(db, preview ? asPreview(courses) : courses)`.
     `validateContent` still gets the real `courses`. When `preview` is set, the log line
     becomes `synced (preview: all courses published locally) at …; watching for changes…`.
   - `sync`: the same `openDb(preview)` and `asPreview`. When `preview` is set, the log says
     `synced (preview: all courses published locally)`.
   - `USAGE`: `fixedstep-content sync [--preview] [content-dir]`, the same for `dev`, plus one
     line: `--preview: sync every course as published (local DATABASE_URL only); a plain sync/dev restores course.yaml`.
3. **Root `package.json`:** add
   `"content:preview": "pnpm --filter @fixedstep/content-cli start dev --preview"` right after
   `content:dev`. Don't add a sync variant; `pnpm content:sync --preview` works as is.
4. **`README.md` "Writing course content":** add a line to the code block after `content:dev`:
   `scripts/in-docker.sh pnpm content:preview                   # same, with published: false courses shown`
   After the paragraph about `content:dev`, add:
   > `content:preview` is `content:dev` with every course synced as published, so you can play
   > a `published: false` course without editing `course.yaml`. It only runs against a local
   > database (`localhost`, `127.0.0.1`, `::1` or the compose `postgres` host; don't point it
   > at a tunnel to a shared database); `bundle` and the publish workflow ignore it. Run `content:sync` (or `content:dev`) afterwards to restore the
   > real `published` values.
5. **`packages/content-cli/template/README.md`** (optional, but it's one line, so include it):
   add `scripts/in-docker.sh pnpm content:preview           # same, showing published: false courses`
   to the "Writing locally" block. This only affects content repos created by future `init` runs.

**No make target.** The root `Makefile` is for the host only: it controls the dev container
(`claude`, `shell`, `up`…). A `content-preview` target would have to choose between
`in-docker.sh` and the dev container, and it would duplicate a one-word pnpm script. Leave it
out unless the user asks for one.

### Tests

**New `packages/content-cli/src/preview.test.ts`**, in vitest `describe`/`it` style like
`bundle.test.ts`. Build a minimal `LoadedCourse` with an `as LoadedCourse` cast, as that file
does.
- `splitPreviewFlag`: `["dev"]` gives no preview. `["dev","--preview"]` gives preview with args
  `["dev"]`. `["dev","--preview","../c"]` and `["--preview","dev","../c"]` both give args
  `["dev","../c"]`.
- `asPreview`: given one course with `published: false` and one with `true`, every output course
  has `published: true`. The input is unchanged (`published` is still `false`), and the other
  fields are kept (`slug`, and `chaptersLoaded` is the same reference).
- `isLocalDatabaseUrl` true for:
  - `postgres://fixedstep:fixedstep@localhost:5432/fixedstep`
  - `…@postgres:5432/fixedstep` (compose)
  - `…@127.0.0.1/x`
  - `…@[::1]:5432/x`
  - `…@LOCALHOST/x`
  - `postgres://u@localhost/fixedstep_e2e`
  - `postgres://u:p@x/db?host=/var/run/postgresql`
- `isLocalDatabaseUrl` false for:
  - `…@10.0.0.5/x`
  - `…@db.abc.eu-west-1.rds.amazonaws.com/x`
  - `…@postgres.example.com/x`
  - `…@localhost.evil.com/x`
  - `postgres://u:p@localhost/db?host=10.1.2.3` (the `host` parameter overrides)
  - `postgres:///db` (empty host)
  - `not a url`
  - `postgres://u:p@a:5432,b:5432/db`
- `assertPreviewDatabase`: throws for `undefined` and for a remote URL. For a URL with a password
  (`postgres://u:s3cret@db.example.com/x`), it throws an error whose message contains
  `db.example.com` and does **not** contain `s3cret`. It doesn't throw for the compose URL.

`cli.ts` runs `main()` when it is imported, so it isn't unit-tested. All of its logic is in
`preview.ts`.

**Checks** (from the repo root, verbatim):
- `node_modules/.bin/biome check .`
- `node_modules/.bin/tsc -p packages/content-cli --noEmit` (and `apps/api`, `e2e`, which import
  `content-cli/sync`, unchanged)
- `node_modules/.bin/vitest run --configLoader runner`

Manual: run `scripts/in-docker.sh pnpm content:preview` against a content dir that has a
`published: false` course (`content:new` scaffolds one). Check that the course shows up at
:5173, and that editing a lesson re-syncs it. Run `DATABASE_URL=postgres://u:p@db.example.com/x pnpm content:preview`
and check it exits 1 with the guard message and never tries to connect. Run
`pnpm content:sync` and check the course is hidden again. Run
`pnpm --filter @fixedstep/content-cli start bundle content-sample /tmp/b.json --preview` and
check it prints the usage error and exits 2.

### Risks

- **Hidden tests, answers and solutions reaching the browser:** no change. The API routes and
  DTOs are untouched, and preview only flips `courses.published` in a local DB.
- **XP outside `progress.ts`, `harnessRuntime`, cloud SDKs:** none of these are touched.
- **Drafts getting published to a shared DB:** the guard is the safety net. It fails closed:
  empty host, unparseable URL, multi-host URLs and non-loopback IPs are all refused. The one
  hole left is a remote DB reached through a local tunnel (`localhost:5433` → Cloud SQL proxy),
  which counts as local. Mention that in the README sentence ("local" means this host/compose
  network) and accept it. Only dev machines run the CLI, and the publish path never goes
  through `cli.ts`.
- **Leftover preview state:** a preview sync leaves `published = true` in the local DB until the
  next plain `sync`/`dev`. That's local-only and documented, and the log line reminds the author
  on every sync.
