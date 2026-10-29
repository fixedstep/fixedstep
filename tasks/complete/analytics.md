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
  **Rechecked (lead, 2026-10-28, posthog.com):** free tier is 1M product-analytics events/month,
  1 project, 1-year retention, no card; events over the limit are dropped, not billed. Paid
  per-event rates are inconsistent across their pages, so the README links posthog.com/pricing
  instead of quoting a rate.
- **One PostHog project shared by staging and prod** (user, 2026-10-28; the free plan allows only
  one project). This replaces "each stage gets its own project" below. Every event carries a
  `stage` super property (`staging` / `prod`), and PostHog filters separate the two.

## Suggested approach

1. **Product analytics (PostHog).**
   - Config: a public project key and host (EU or US region) passed to the web app at build or
     runtime config. Unset means off, which is the default for local, e2e and CI. ~~Staging and
     prod each get their own PostHog project.~~ (Superseded: one shared project, `stage` tag.) Add the values to `infra/src/app-spec.ts` so both
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

## Resolved (user, 2026-10-28)

- PostHog region: **US** (`https://us.i.posthog.com`).
- Guests: **tracked anonymously** (in-memory anonymous id, no cookies/localStorage), so sign-up
  funnels work; identify by opaque user id after sign-in, reset on sign-out.
- Event retention: PostHog's free-tier default, 1 year (lead's pricing recheck).
- Privacy policy / terms update naming PostHog: **deferred to a follow-up**, not in this task.
- Learning metrics for authors: **an admin-only API route** (not a content-cli command). Admin
  responses are built field-by-field and never include `hiddenTests`, `solution` or quiz
  `answer`s.
- **One shared PostHog project** for staging and prod, events tagged with `stage`.

## Acceptance criteria

- [ ] Product analytics: page views and the named funnel events reach the shared PostHog
      project, tagged with `stage`, from staging and prod; analytics is off when the key is
      unset (local, e2e, CI), and no cookies or local storage that need consent are set.
      Code side done and tested (off when unset, `persistence: "memory"`, `stage` registered
      before any event, `analytics-off` e2e spec). Live delivery from staging and prod: moved
      to task `analytics-live-check`.
- [x] No email, name or other PII is sent to PostHog; users are identified by an opaque id.
- [x] Learning metrics: per-lesson and per-course aggregates are available to authors for a
      chosen stage, computed from existing tables, and covered by tests.
- [x] Config lands in both the GCP and AWS targets, and the PostHog plan/cost is recorded in the
      README. (`pnpm infra preview` on one stack per cloud: moved to task
      `analytics-live-check`.)

## Plan

### Read first: deferred, unverifiable here, infra/cost

- **Deferred:** privacy policy/terms update naming PostHog (user decision, follow-up task). PostHog
  reverse proxy through our domain (optional in the task; not done).
- **Can't be verified in this branch:** events actually arriving in the shared PostHog project
  from staging and prod, and the `stage` filters working there. That needs the PostHog project
  created, `posthogKey` set on both stacks, and a deploy. Tick AC 1 only after the lead does the
  post-merge check at the end of this plan. Everything else (off when unset, no PII, `stage` on
  every event, metrics) is covered by unit tests here.
- **Infra/cost (approved, user 2026-10-28):** no new cloud resources. New *non-secret* Pulumi
  config keys `posthogKey` and `posthogHost`; new API env vars `POSTHOG_KEY`, `POSTHOG_HOST`,
  `APP_STAGE`; new route `GET /api/config`. PostHog is an external SaaS: free tier
  (1M events/mo, 1 project, 1-year retention, overage dropped not billed; lead recheck
  2026-10-28). The README links posthog.com/pricing rather than quoting paid rates.
- **DB migration in scope:** there was no admin/role concept (`user` has no role; no
  better-auth admin plugin). This branch adds a `user_role` enum (`user` | `admin`) and a
  `user.role` column, `NOT NULL DEFAULT 'user'`, as migration `0005`. Existing rows backfill to
  `user`. Admins are granted by a documented SQL statement (see Design notes).
- **New dependency (approved):** `posthog-js` in `apps/web`. If the sandbox can't reach the
  npm registry, the lead/user runs `pnpm --filter @fixedstep/web add posthog-js` and commits
  the lockfile.
- **Accepted gap (user, 2026-10-28):** a full-page redirect (GitHub OAuth, Polar checkout,
  verify-email link) starts a new in-memory PostHog anonymous id, so anonymous events from
  before the redirect don't join the identified ones after it. Documented in the README; not
  fixed here.

### Scope

AC 1 (code + tests; live delivery checked post-merge), AC 2, AC 3 (admin API route), AC 4.

### Design notes

- **Runtime config, not build-time.** One image serves the SPA; Vite `VITE_*` vars would need
  per-stack Docker build args in both clouds. Instead the API exposes `GET /api/config` and the
  web app fetches it at boot. Key unset → `{ analytics: null }` → posthog-js is never even
  loaded (dynamic `import()`), so local/e2e/CI send nothing.
- **Stage:** the API doesn't know its stage today (only `POLAR_SERVER`/`EMAIL_SUBJECT_PREFIX`
  hint at it), so `apiSpec` adds `APP_STAGE: config.stage`. The web registers it as a PostHog
  super property right after init: `posthog.register({ stage })`.
- **PostHog init options** (implementer: confirm option names against the installed
  posthog-js version): `api_host: host`, `persistence: "memory"`, `autocapture: false`,
  `capture_pageview: false` (we send `$pageview` on route resolve), `capture_pageleave: false`,
  `disable_session_recording: true`, `person_profiles: "identified_only"`, and a `before_send`
  hook that runs `sanitizeUrl` over `$current_url`, `$referrer`, `$initial_referrer` and
  `$pathname`-like props (strips query and hash: `/reset-password?token=…`, `?redirect=`,
  `?checkout=` must not leave the browser). Memory persistence: no cookie, no localStorage.
- **Identity:** `identify(user.id)` only for non-anonymous users (better-auth ids are opaque
  random strings); no `$set`, no person properties. Guests stay anonymous with PostHog's
  in-memory id; `reset()` on sign-out. Accepted gap (see top): full-page redirects lose the
  anonymous id. Email sign-up (SPA navigation) does join.
- **Admin role.** `user.role` is a `pgEnum("user_role", ["user", "admin"])`, `notNull()`,
  `default("user")`. It is **not** declared in better-auth (`user.additionalFields` stays
  unset): better-auth then never reads it into the session and never writes it, so sign-up
  inserts get the DB default, and `/update-user` and `/sign-up/email` have no `role` field to
  accept. (Declaring it with `input: false` was the alternative; leaving it out is smaller and
  keeps role out of the session payload.) The admin check reads the role server-side with
  a fresh `select role from user where id = $1` per request and also requires the session user to
  be `emailVerified && !isAnonymous`. Tests prove a client can't set it (see Tests). If the
  better-auth `admin` plugin is ever added, it uses the same `role` column name and values;
  note that in a schema comment.
- **Granting admin: a documented SQL statement** (chosen as simplest). A CLI command would
  still need a connection to the stage DB, which is private on both clouds, so it adds code
  without removing a step. The README gives
  `UPDATE "user" SET role = 'admin' WHERE email = '<email>' AND email_verified AND NOT
  coalesce(is_anonymous, false);` (expect `UPDATE 1`), and how to run it: locally with `psql`
  against the compose DB; AWS via the stack's existing ops task (`psql "$DATABASE_URL" -c …`,
  same `aws ecs run-task` pattern as "Moving between clouds"); GCP via the Cloud SQL Auth Proxy
  steps already in that section. Revoke with `SET role = 'user'`.
- **Events** (typed union so props can only be ids/slugs/enums, never free text):
  - `$pageview`: on `router.subscribe("onResolved")`.
  - `sign_up {method: "email" | "github", fromGuest: boolean}`: email in `LoginPage` after a
    successful `signUp.email`; GitHub via `newUserCallbackURL` on `signIn.social` carrying
    `?signed_up=github` (confirm better-auth 1.7 supports `newUserCallbackURL`; if not, record
    GitHub sign-ups as a known gap rather than inferring).
  - `email_verified`: `signUp.email`'s `callbackURL` gets `?verified=1`; fire when the param
    is present, there's no `error` param, and `/me` says `emailVerified` (new field), then strip
    the param with `replaceState` (same pattern as `useUpgrade`'s `?upgrade=`).
  - `course_started {course}`: first lesson completion in a course (the cached `["courses"]`
    outline shows no completed lessons in it before this submit). No view/attempt data exists
    client-side, so "start" = first completion; document that in the analytics module.
  - `lesson_completed {course, lessonId, kind}`: submit returns `completed` and the lesson
    wasn't already `completed`.
  - `checkout_started {interval}`: `useUpgrade` checkout `onSuccess`, captured with the beacon
    transport (`{ transport: "sendBeacon" }` or posthog-js's current equivalent) before
    `window.location.assign`.
  - `checkout_completed`: confirmed state only: `HomePage` with `?checkout=success` polls `/me`
    (`refetchInterval` ~3 s, stop after ~60 s or once `pro`), fires once when `me.pro` is true,
    then strips the param (keep the notice via `useState` initializer).

### Changes (in order)

1. `packages/content-schema/src/index.ts`: new DTOs.
   - `ClientConfig = z.object({ analytics: z.object({ key: z.string(), host: z.url(), stage:
     z.string() }).nullable() })`.
   - `LessonMetrics = z.object({ lessonId, slug, title, kind: LessonKind, chapterSlug,
     starts: int, completions: int, medianAttemptsToPass: number.nullable(), hintsAvailable:
     int, learnersWithHints: int, hintUnlocks: int, dropOffFromPrev: number.nullable() })`.
   - `CourseMetrics = z.object({ slug, title, published: boolean, learners: int, completers:
     int, completionRate: number.nullable(), rating: z.object({ average: number.nullable(),
     count: int }), lessons: z.array(LessonMetrics) })`. Comment: built field-by-field; never
     hint texts, `hiddenTests`, `solution`, `quiz`.
2. `apps/api/src/env.ts`: `POSTHOG_KEY: z.string().optional()`, `POSTHOG_HOST:
   z.url().default("https://us.i.posthog.com")`, `APP_STAGE: z.string().optional()`. Add a
   transform issue: `POSTHOG_KEY` set without `APP_STAGE` →
   "APP_STAGE is required when POSTHOG_KEY is set".
3. `apps/api/src/routes/config.ts` (new): `configRoutes({ env }: Pick<Deps,"env">)`,
   `GET /config` → `ClientConfig` (`analytics: null` when no key). `Cache-Control: no-cache`.
4. `apps/api/src/routes/me.ts`: add `emailVerified: Boolean(user.emailVerified)` to `user`.
   `apps/web/src/lib/api.ts`: add it to `Me`, add `api.config()`.
5. **DB role.**
   - `packages/db/src/schema.ts`: `export const userRole = pgEnum("user_role", ["user",
     "admin"])`; on `user`: `role: userRole("role").notNull().default("user")` with a comment
     ("server-only; not a better-auth field, so clients can't set it; grant via SQL, README").
   - `packages/db/drizzle/0005_user_role.sql` + `meta/0005_snapshot.json` + `_journal.json`:
     generated, not hand-written: `pnpm --filter @fixedstep/db generate --name user_role` (lead/
     user runs it if the sandbox can't; drizzle-kit `generate` needs no DB). Expected SQL:
     `CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');` and
     `ALTER TABLE "user" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;`.
   - `apps/api/src/auth.ts`: no `additionalFields`; add a one-line comment next to the drizzle
     schema mapping saying `user.role` is deliberately not exposed to better-auth.
6. `apps/api/src/lib/admin.ts` (new): `isAdmin(db: Db, user: SessionUser | null):
   Promise<boolean>` (false if null, anonymous or `!emailVerified`; else reads `user.role` by id
   and returns `role === "admin"`) and `requireAdmin(db: Db): MiddlewareHandler<AppEnv>`: 401 with
   no user, 403 otherwise if not admin.
7. `apps/api/src/lib/learning-metrics.ts` (new): `courseMetrics(db: Db, opts?: { courseSlug?:
   string }): Promise<CourseMetrics[]>`. Non-archived courses (published or not), chapters and
   lessons ordered by chapter then lesson position. Select only the columns needed (never
   `select({ lesson: lessons })`). Definitions, all users including guests:
   - `starts`: distinct users with ≥1 submission on the lesson.
   - `completions`: `lesson_progress` rows.
   - `medianAttemptsToPass`: per user with a passed submission, count of their submissions up
     to and including the first pass; `percentile_cont(0.5)`; null if nobody passed.
   - `hintsAvailable`: `cardinality(lessons.hints)`; `hintUnlocks`: sum over users of
     `least(hintsAvailable, failed+error count)` (same rule as `lib/hints.ts`);
     `learnersWithHints`: users with ≥1 unlocked.
   - `dropOffFromPrev`: for each lesson after the course's first, `1 - (users who completed the
     previous lesson and started this one) / (users who completed the previous lesson)`; null
     for the first lesson or when the previous has 0 completions.
   - Course: `learners` = distinct users with any submission in the course; `completers` =
     users with `lesson_progress` for every non-archived lesson; `completionRate` =
     completers/learners (null if 0); `rating` = raw `count` and `avg` rounded to 2 (no
     `MIN_RATINGS_TO_SHOW` threshold for admins).
   - Doc comment: stale guests are deleted by `deleteStaleGuests` (cascade), so guest-only
     activity eventually drops out of the numbers.
8. `apps/api/src/routes/admin.ts` (new): `adminRoutes({ db }: Pick<Deps, "db">)` with
   `r.use("/admin/*", requireAdmin(db))`; `GET /admin/metrics` → `CourseMetrics[]`; `GET
   /admin/metrics/:slug` → `CourseMetrics` or 404 (validate with `Slug`). Authors open the URL
   in a browser while signed in (same-origin cookie) to read the JSON.
9. `apps/api/src/app.ts`: `app.route("/api", configRoutes(deps))` and `adminRoutes(deps)`.
10. `apps/web/src/lib/analytics.ts` (new; pure logic, no React):
   - `type AnalyticsEvent` (union above), `type PostHogLike = { init; register; capture;
     identify; reset }` (the subset used).
   - `sanitizeUrl(href: string): string` → origin + pathname.
   - `posthogOptions(host: string)`: the init options above, exported for tests.
   - `createAnalytics(load: () => Promise<PostHogLike>)` returning `{ init(config:
     ClientConfig["analytics"]): Promise<void>; track(e: AnalyticsEvent): void;
     pageview(): void; setUser(user: Me["user"]): void }`. Buffers calls (cap ~50) until
     `init` resolves; `init(null)` drops the buffer and makes everything a no-op without calling
     `load`. `init` calls `ph.init(key, posthogOptions(host))` then `ph.register({ stage })`
     before flushing. `setUser`: identify on a new non-anonymous id, `reset()` when going from
     identified to null, nothing for guests.
   - `export const analytics = createAnalytics(() => import("posthog-js").then((m) =>
     m.default))`.
11. `apps/web/src/main.tsx`: `void api.config().then((c) => analytics.init(c.analytics),
    () => analytics.init(null))`; `router.subscribe("onResolved", () => analytics.pageview())`.
12. `apps/web/src/components/Layout.tsx`: effect `analytics.setUser(me.data?.user ?? null)`;
    sign-out button calls `analytics.setUser(null)` after `signOut()`.
13. `apps/web/src/pages/LoginPage.tsx`: `sign_up` (email); `callbackURL` with `verified=1`;
    `newUserCallbackURL` with `signed_up=github`. Add a small helper in
    `apps/web/src/lib/redirect.ts`: `withParam(path, key, value)` (and reuse in `withUpgrade` if
    it fits). The marker handling (`email_verified`, GitHub `sign_up`) goes in a
    `useAnalyticsMarkers(me)` hook called from Layout.
14. `apps/web/src/pages/LessonPage.tsx` (`useSubmit`): pass `lesson` in; on success, fire
    `lesson_completed` / `course_started` using `findLessonContext(qc.getQueryData(["courses"]),
    lessonId)` read *before* invalidating.
15. `apps/web/src/components/Upgrade.tsx`: `checkout_started` in `onSuccess`.
    `apps/web/src/pages/home/HomePage.tsx`: `checkout_completed` as above.
16. `infra/src/app-spec.ts` (`apiSpec`): read `posthogKey`, `posthogHost` via
    `new pulumi.Config().get(...)`; always set `APP_STAGE: config.stage`; set `POSTHOG_KEY`/
    `POSTHOG_HOST` only when `posthogKey` is set (else `pulumi.log.info` "analytics off").
    **`infra/src/gcp/` and `infra/src/aws/`: no edits needed**: both
    map `spec.env` generically (`gcp/service.ts:121`, `aws/service.ts:195`). Verify with
    `pnpm infra preview` on one stack of each cloud (lead).
17. `.env.example`: `POSTHOG_KEY=` (blank = off), `POSTHOG_HOST=`, `APP_STAGE=`, with
    one-line comments.
18. `README.md` (Deploying): an "Analytics (PostHog)" subsection: one shared US project for both
    stages, free tier as rechecked 2026-10-28, "see posthog.com/pricing" for paid rates;
    `pnpm infra config set -s <stack> posthogKey phc_…` (same key on both stage stacks; not a
    secret, it's public in the browser). Known, accepted gap: full-page redirects (GitHub
    login, Polar checkout, the verify-email link) start a new anonymous id, so funnels through
    them join only from the identified side. PostHog project settings to apply:
    discard client IP data, and set the **internal/test account filter** to `stage != prod`
    (so "filter out internal and test users", on by default for new insights, gives prod only);
    for staging only, add the filter `stage = staging` and turn the test-account toggle off.
    Note that funnel/retention insights should keep the test-account filter on. Add copying
    `posthogKey`/`posthogHost` with the other config in "Moving between clouds" (the role
    column moves with the DB dump). A "Learning metrics (admins)" subsection: `GET
    /api/admin/metrics[/:slug]` for verified accounts with `role = 'admin'`, and the grant/revoke
    SQL plus how to run it per environment (Design notes).

### Tests

- `apps/api/src/env.test.ts`: analytics off by default (`POSTHOG_KEY` undefined, host default
  US); `POSTHOG_KEY` without `APP_STAGE` throws.
- `packages/db/src/schema.test.ts` (new; `createTestDb`, so it runs every migration incl.
  `0005`): a user inserted without `role` reads back `"user"`; `role` can be set to `"admin"`;
  inserting `role: null` (raw `sql`) fails (NOT NULL); a value outside the enum (raw `sql`
  `'owner'`) fails. Also: a migration test that applies migrations `0000`–`0004` on a fresh
  PGlite (copy the first five journal entries to a temp folder, or run the raw SQL files in
  order), inserts a user, then applies `0005` and checks that user backfilled to `"user"`.
  If partial migration proves awkward with drizzle's migrator, the implementer may fall back
  to executing `0005_user_role.sql` directly on a DB built from `0000`–`0004` SQL files.
- `apps/api/src/auth.test.ts` (new; real `createAuth(env, createTestDb(), logEmailProvider)`,
  requests through `auth.handler(new Request(...))`): `POST /api/auth/sign-up/email` with
  `role: "admin"` in the body → the stored role is `"user"` (or the request is rejected;
  either way never `"admin"`); signed in with that session cookie, `POST
  /api/auth/update-user` with `{ role: "admin" }` → stored role still `"user"`; the
  `get-session` payload has no `role`. (Cast the PGlite db to `Db` with `as never` as other
  tests do.)
- `apps/api/src/lib/admin.test.ts` (new, `createTestDb`): `isAdmin` false for null, anonymous,
  unverified admin-role user, verified `user`-role user; true for verified `admin`; reads the
  DB, not the session object (a fake session user claiming `role: "admin"` with DB role
  `user` → false).
- `apps/api/src/routes/config.test.ts` (new, Hono `app.request` like `internal.test.ts`):
  `{ analytics: null }` without a key; `{ key, host, stage }` with one; parses as
  `ClientConfig`.
- `apps/api/src/lib/learning-metrics.test.ts` (new, `createTestDb` + insert helpers like
  `courses.test.ts`): a 3-lesson course with users on different paths. Cases: starts vs
  completions; median attempts (e.g. users needing 1, 2, 4 → 2); null median with no passes;
  hint unlocks capped at hint count; drop-off between lessons 1→2 and null for lesson 1;
  completion rate; ratings raw avg/count below 3; archived lessons excluded; guest users
  counted; and a leak check: `JSON.stringify(result)` contains none of seeded `hiddenTests`,
  `solution`, a quiz `answer` marker, or hint text.
- `apps/api/src/routes/admin.test.ts` (new; `createTestDb` users with roles, `x-user` header
  middleware like `courses.test.ts` setting `{ id, emailVerified, isAnonymous }`): 401 signed
  out; **403 for a verified non-admin, an unverified admin-role user, and an anonymous user**
  on both `/admin/metrics` and `/admin/metrics/:slug`; 200 for a verified admin; `/:slug` 404
  for unknown; response parses with `CourseMetrics` and the same leak check.
- `apps/web/src/lib/analytics.test.ts` (new, node env, fake `PostHogLike` with `vi.fn()`):
  `init(null)` never calls `load` and `track`/`pageview` are no-ops; init passes
  `persistence: "memory"`, `autocapture: false`; `register({ stage })` is called before any
  buffered event is flushed, and a fake that applies registered super props to captures shows
  `stage` on `$pageview`, a custom event and after identify; buffered events flush in order;
  `setUser` identifies by id only (one arg), skips guests, `reset()` on sign-out, no repeat
  identify for the same id; `sanitizeUrl` strips query/hash (`/reset-password?token=x` →
  `/reset-password`), and `before_send` applies it.
- `apps/web/src/lib/redirect.test.ts`: `withParam` cases.
- Checks (repo root): `node_modules/.bin/biome check .`; `node_modules/.bin/tsc -p <pkg>
  --noEmit` for `apps/api`, `apps/web`, `packages/content-schema`, `packages/db`, `infra` (and
  the rest per CLAUDE.md); `node_modules/.bin/vitest run --configLoader runner`; e2e
  `e2e/node_modules/.bin/playwright test --config e2e/playwright.config.ts` (key unset there,
  so existing flows must be unchanged).

### Risks (CLAUDE.md invariants)

- **Hidden tests/answers leaking:** admin metrics touch `lessons`. Select explicit columns,
  only `cardinality(hints)` (never the array), and build `CourseMetrics` field-by-field. Leak
  tests above. Analytics props are typed ids/slugs/enums only; no lesson content or code.
- **PII to PostHog:** URLs sanitized in `before_send`; autocapture and session recording off;
  `identify(id)` with no properties. `/me` gains `emailVerified` (a boolean about the caller
  only; fine).
- **XP/progress:** unaffected; metrics are read-only, nothing writes outside `progress.ts`.
- **`harnessRuntime`:** untouched.
- **Cloud SDKs in `apps/`/`packages/`:** none; `posthog-js` is a browser analytics lib.
  Config flows only through `app-spec.ts`.
- **Admin auth / role escalation:** the role is only in the DB, never a better-auth field, so
  sign-up and update-user can't set it (`auth.test.ts` proves it); the check re-reads the DB
  per request and also requires verified + non-anonymous. Grants are manual SQL by someone with
  DB access. `mergeGuestProgress` and `deleteStaleGuests` don't touch `role`. An admin route
  mistake exposes aggregates, not content.
- **Migration:** additive (`ADD COLUMN … DEFAULT … NOT NULL` backfills in one statement; tiny
  `user` table), runs on API start via `RUN_MIGRATIONS` as before. Old API containers during a
  rollout ignore the column. Rollback: leaving the column is harmless.

### Optional (not in this branch)

PostHog reverse proxy via our domain; a web admin page rendering the metrics; date-range filter
(`?since=`) on the metrics route; server-side capture of sign-up/checkout from the API.

### Post-merge check (lead)

Create the shared US PostHog project; `pnpm infra config set -s <cloud>-staging posthogKey …`
and the same on prod; deploy; grant the first admin with the README SQL and open
`/api/admin/metrics`; in PostHog Live events confirm `$pageview` and
a sign-up from staging carry `stage=staging` and no email/name/query strings; apply the
test-account filter; then tick AC 1 (prod part after the first prod release).
