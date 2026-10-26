# Add a "course tester" agent and a small Playwright end-to-end suite

**Area:** new `e2e/` workspace package (or `apps/e2e`), `.github/workflows/ci.yml`,
`.claude/agents/course-tester.md` (user-installed), `.claude/skills/ship-task/SKILL.md`
(user-installed), `.claude/hooks/role-guard.sh` (user-installed), `CLAUDE.md`
**Depends on:** `course-ratings` (PR #20) being merged, because spec 4 tests it.
**Origin:** requested 2026-10-23, while shipping `course-ratings`. The ratings widget is built
for the keyboard, but `apps/web` has no DOM tests, so nothing checks the real UI.

## Problem

Every check we have is a unit test or an API test. Nothing loads the site in a browser and uses
it the way a student would: signing up, working through lessons, submitting, seeing XP and
progress update, and hitting the paywall. UI regressions only turn up by hand.

## Decisions (agreed with the user)

- **Playwright**, so the same tests run locally, for the agent, and in CI where it makes sense.
  Not Claude in Chrome.
- **Permanent e2e tests, essentials only.** A small suite of critical journeys, not full coverage.
  Each new spec has to justify its runtime.
- **A `course-tester` agent persona** writes and runs those specs against a locally running app,
  and reports bugs with repro steps and screenshots. It edits only `e2e/`, never production code.
  Bugs go back to `implementer`, the same way `tester` works today.

## Suggested approach

- **Suite (start with roughly 5 specs):**
  1. A guest opens a free lesson, passes a code lesson and sees XP. They sign up, and their guest
     progress is merged into the new account.
  2. A quiz lesson: a wrong answer, then a right answer, then the completion card.
  3. A paid lesson shows the locked/upgrade state to a user without an entitlement.
  4. Course rating: rate from the lesson sidebar using only the keyboard; the average appears
     after 3 ratings. The API returns 403 to guests and to users who haven't completed a lesson in
     that course, so the seed needs three signed-up users who have each completed a lesson in it.
     Seeding bare rating rows won't do.
  5. Login, logout and password reset, with email read through the `log` provider's output.
- **Environment:** `docker compose up -d postgres`, migrate, `content:sync` from
  `content-sample/`, then the API and web dev servers (or the built images). Use Playwright's
  `webServer` config to start and wait on them. Keep tests independent with a fresh user per test.
- **CI:** a separate `e2e` job in `ci.yml` with its own `timeout-minutes`, using a Postgres
  service container and caching the Playwright browsers. Decide whether it gates PRs or only
  runs on `main` and for PRs that touch the web/API. Start non-blocking if it's flaky.
- **Sandbox:** Chromium and a connection to the host's dev server both run into the Claude Code
  sandbox on Linux. A sandboxed command's localhost is private, and Chromium needs user namespaces
  (or `--no-sandbox`). Work out the minimal settings, such as an `excludedCommands` entry for
  the exact e2e command, and write them up for the user to apply. Don't widen the sandbox as a
  side effect.
- **Agent and workflow:**
  - Draft `.claude/agents/course-tester.md` (tools: Read, Grep, Glob, Bash, Edit, Write; edits
    limited to `e2e/`) and a `role-guard.sh` role for it in the scratchpad, for the user to
    install.
  - Add an optional `/ship-task` step between `tester` and `reviewer` for changes under
    `apps/web` or that change an API response the UI reads.

## Acceptance criteria

- [ ] `e2e/` package with Playwright config and the essential specs above, passing locally from
      one documented command.
- [ ] Specs are independent and seed their own data, with no order dependence and no shared users.
- [ ] CI job runs the suite with a timeout and browser caching. Its gating policy is documented.
- [ ] `course-tester` agent definition, role-guard rule and ship-task step drafted, and installed
      by the user.
- [ ] Sandbox settings needed to run the suite from an agent are documented in CLAUDE.md
      "Running checks".
- [ ] Lint, typecheck and tests pass.

## Plan

**Flags:** no acceptance criterion is deferred, but three need the user:
- **Installs.** The user installs the agent file, the role-guard update, the SKILL.md step and the
  sandbox settings (see *User steps*).
- **Lockfile.** The user runs `pnpm add` to update `pnpm-lock.yaml`.
- **Browser.** The user runs the one-time Chromium download. It comes from Playwright's CDN,
  which isn't in the sandbox's allowed domains.

No infra change and no `infra/src/{gcp,aws}` edits. **No production code changes**: nothing in
`apps/` or `packages/` is edited. Cost: one new CI job of roughly 5 runner-minutes per PR and per
`main` push. That's free on a public repo and billed minutes on a private one.

### Scope

All six criteria:
- The CI job ships **non-blocking** (see *CI*).
- The `course-tester` agent loads only in a new session, so this branch can't run it through
  `/ship-task`. The suite is verified by running the e2e command directly (implementer, or the
  user with `! pnpm e2e`).
- Criterion 4 is ticked once the user has installed the drafts. The installed files are tracked
  (`.claude/agents/`, `.claude/skills/`, `.claude/hooks/`), so they land in this PR, and the
  reviewer flags them for the user's sign-off.

### Sandbox decision (goes into CLAUDE.md)

**Recommended:** add one **exact** command to `sandbox.excludedCommands` and
`permissions.allow` in `.claude/settings.local.json`:

```
e2e/node_modules/.bin/playwright test --config e2e/playwright.config.ts
```

Use no wildcard and no extra arguments, so it always runs the whole suite (5 specs, about a
minute).

Why this one:
- **What actually blocks a sandboxed run** is the host's Postgres on `localhost:5432`, which the
  sandbox's private localhost can't reach. Chromium isn't the problem: Playwright already
  launches it with `--no-sandbox` (`chromiumSandbox` defaults to `false`), and leave that
  default alone. The API and Vite servers are fine too, because they're Playwright `webServer`s,
  i.e. children of the same command.
- **Running outside the sandbox** fixes all of that for one command.
- **`allowNestedUserNamespaces` is worse.** It removes code-execution isolation for *every*
  command, it's honored only from user settings, and it doesn't fix the localhost problem anyway.
- **No wildcard:** with `*`, any `--config <file>` could run outside the sandbox.
- **`permissions.allow` is needed too:** the command isn't sandboxed, so
  `autoAllowBashIfSandboxed` doesn't cover it, and without the allow entry every run prompts.

The trade-off, stated plainly: this command runs whatever is in `e2e/`, plus the API it starts,
outside the sandbox. The course-tester can edit `e2e/`. Review `e2e/` diffs as code.

### Changes (in order)

1. **`pnpm-workspace.yaml`**: add `- e2e` under `packages`.
2. **`e2e/package.json`** (new): `"name": "@fixedstep/e2e"`, private, `"type": "module"`,
   AGPL license.
   - Scripts: `"e2e": "playwright test"` and `"typecheck": "tsc -p ."`. `pnpm -r typecheck`
     then covers it.
   - Deps: `@fixedstep/db` and `@fixedstep/content-cli` (`workspace:*`, used by `start-api.ts`),
     plus `@fixedstep/content-schema` (`workspace:*`, type-only imports).
   - **Hand-off:** the user then runs
     `! pnpm --filter @fixedstep/e2e add -D -E @playwright/test`. That pins the current latest
     version **exactly** (no caret) and updates the lockfile. Don't add Playwright anywhere else.
3. **Root `package.json`**: add the script `"e2e": "pnpm --filter @fixedstep/e2e e2e"` (for
   humans and CI).
4. **`e2e/tsconfig.json`**: extends `../tsconfig.base.json`, with `"types": ["node"]` and
   `"lib": ["ES2023", "DOM"]` (for `page.evaluate`). `include`: `["*.ts", "specs", "support"]`.
5. **`e2e/support/env.ts`**: shared constants. Comment that the specs depend on
   `content-sample` slugs and quiz answers.
   ```ts
   export const API_PORT = 3100, WEB_PORT = 5174; // not 3000/5173: a dev stack may be running
   export const WEB_URL = `http://localhost:${WEB_PORT}`;
   export const API_URL = `http://localhost:${API_PORT}`;
   export const DATABASE_URL = process.env.E2E_DATABASE_URL
     ?? "postgres://fixedstep:fixedstep@localhost:5432/fixedstep_e2e";
   export const REPO_ROOT: string; // fileURLToPath(new URL("../..", import.meta.url))
   export const API_LOG: string;   // <repo>/e2e/.output/api.log
   export const PASSWORD = "e2e-password-1";
   export const COURSE = "2d-fundamentals";
   export const LESSONS = { reading: "what-is-a-game-loop", code: "moving-with-delta-time",
     paid: "bouncing-ball", quiz: "fixed-timestep-quiz" } as const;
   ```
6. **`e2e/support/start-api.ts`** (new; run by `tsx`, not by Playwright). It does this in order:
   1. Refuse to run unless the DB name ends in `_e2e`.
   2. Connect to the same URL with path `/postgres` (`createDb(adminUrl, { max: 1 }).$client`),
      then run `DROP DATABASE IF EXISTS "<name>" WITH (FORCE)` and `CREATE DATABASE "<name>"`.
      **Every run starts empty**, which spec 4 relies on, and the dev DB is never touched.
   3. `runMigrations(DATABASE_URL)` (`@fixedstep/db/migrate`).
   4. `syncContent(createDb(url, { max: 1 }), await loadContent(<repo>/content-sample))`. The
      content dir is always `content-sample`, ignoring `CONTENT_DIR`. Close the client.
   5. Truncate `API_LOG` (mkdir `e2e/.output`). Spawn
      `process.execPath --import tsx apps/api/src/server.ts` with cwd `REPO_ROOT` and env
      `{ ...process.env, PORT: 3100, DATABASE_URL, RUN_MIGRATIONS: "false",
      BETTER_AUTH_SECRET: <fixed 32+ char test string>, BETTER_AUTH_URL: WEB_URL,
      WEB_ORIGIN: WEB_URL, EMAIL_PROVIDER: "log", GRADER_MODE: "local" }`.
      - Blank these, so a developer's shell can't switch on real providers: `SMTP_URL`,
        `EMAIL_SUBJECT_PREFIX`, `GITHUB_CLIENT_ID/SECRET`, `POLAR_*`, `CONTENT_SYNC_TOKEN`,
        `WEB_DIR`. `loadEnv` drops empty values.
      - No `--env-file`: `.env` isn't read.
      - Pipe the child's stdout and stderr to both `process.stdout` and an append stream on
        `API_LOG`. Forward SIGINT/SIGTERM to the child, and exit with its exit code.
7. **`e2e/support/api.ts`** (new): seeding through the **public HTTP API**, so every row comes
   from the real code paths. XP is written only by the real submit → `progress.ts` path. Every
   call sends `headers: { origin: WEB_URL }` for Better Auth's origin check.
   ```ts
   export type TestUser = { name: string; email: string; password: string };
   export function newUser(tag: string): TestUser; // e2e-<tag>-<randomUUID()>@example.test
   export async function signUp(request: APIRequestContext, user?: TestUser): Promise<TestUser>;
   //   POST /api/auth/sign-up/email; expect ok. With page.request, the cookie lands in the page.
   export async function lessonId(request: APIRequestContext, slug: string): Promise<string>;
   //   GET /api/courses → COURSE → chapters[].lessons[] by slug
   export async function completeLesson(request: APIRequestContext, id: string): Promise<void>;
   //   POST /api/lessons/:id/submit with {} (reading lesson); expect completed: true
   export async function rateCourse(request: APIRequestContext, slug: string, stars: number): Promise<void>;
   ```
8. **`e2e/support/mail.ts`**: `resetLinkFor(email: string): string | null`.
   - Read `API_LOG`, find the **last** `[email] to=<email> subject="Reset your Fixedstep password"`,
     and match `/Choose a new password: (\S+)/` after it.
   - The log provider writes each email with a single `console.log`, so parallel tests can't
     interleave inside one email.
9. **`e2e/playwright.config.ts`**:
   ```ts
   defineConfig({
     testDir: "./specs", outputDir: "./test-results",
     fullyParallel: true, forbidOnly: !!process.env.CI,
     retries: process.env.CI ? 1 : 0, workers: process.env.CI ? 2 : undefined,
     timeout: 30_000, expect: { timeout: 10_000 },
     reporter: process.env.CI
       ? [["github"], ["html", { outputFolder: "playwright-report", open: "never" }]]
       : [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
     use: { baseURL: WEB_URL, trace: "retain-on-failure", screenshot: "only-on-failure" },
     projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
     webServer: [
       { command: "node_modules/.bin/tsx e2e/support/start-api.ts", cwd: REPO_ROOT,
         url: `${API_URL}/health`, timeout: 120_000, reuseExistingServer: false },
       { command: "node_modules/.bin/vite --port 5174 --strictPort", cwd: `${REPO_ROOT}/apps/web`,
         env: { API_PROXY_TARGET: API_URL }, url: WEB_URL, timeout: 60_000, reuseExistingServer: false },
     ],
   });
   ```
   - `reuseExistingServer: false` is deliberate. Each run needs a fresh DB and its own API log,
     and a fresh API also resets the in-memory rate limiters.
   - The 1280 px viewport is "wide", so the outline starts open on reading/quiz lessons.
10. **Specs** (`e2e/specs/*.spec.ts`).
    - Name them `.spec.ts` so vitest's root `include` never picks them up.
    - Use role/label locators, and never `waitForTimeout`.
    - Every test creates its own users (`newUser`), so no test depends on another.
    - Only `start-api.ts` imports workspace runtime code; specs import `@playwright/test`,
      `../support/*`, and types only.
    1. **`guest-progress.spec.ts`**
       1. A signed-out page opens `/lessons/<code id>`.
       2. Click `.cm-content`, press `ControlOrMeta+A`, then `page.keyboard.insertText(<content-sample/…/moving-with-delta-time/solution.ts, read from disk>)`.
          Fallback if CodeMirror re-indents: an `addInitScript` that sets
          `localStorage["fixedstep:draft:<id>"]`.
       3. Click the button `/^Submit/`.
       4. Expect "Lesson complete", "+10 XP", `getByTitle("Experience")` = "⭐ 10 XP", and the
          "Save progress" link (a guest).
       5. Click "Create a free account" (GuestNudge) → heading "Save your progress". Fill Name,
          Email and Password, then click "Sign up".
       6. Expect: back on the lesson URL, a "Sign out" button (no longer a guest), still "⭐ 10 XP",
          and the heading's "Completed" ✅. Also check `page.request.get("/api/me")` →
          `user.isAnonymous === false`, `xp === 10`.
    2. **`quiz.spec.ts`**
       1. `signUp(page.request)`, then goto `/lessons/<quiz id>`.
       2. Capture the GET `/api/lessons/<id>` response with `waitForResponse`. Assert that each
          `quiz[]` item's keys are exactly `id, prompt, options`, so no `answer` reaches the
          browser.
       3. Pick "It makes the game run faster" and "Deterministic, reproducible simulation", then
          click "Submit answers". Expect "Not quite. Try another option." and no "Lesson
          complete".
       4. Pick "Movement speed stays the same regardless of frame rate" and submit. Expect
          "Lesson complete", "+10 XP", and "That's the end of 2D Game Fundamentals".
    3. **`paywall.spec.ts`**, two tests:
       - **Signed out:** goto `/lessons/<paid id>`. Assert that the 402 response body's keys are
         exactly `id, locked, title`. Expect "Pro lesson", a heading containing "Bouncing ball",
         and the button "Create an account to upgrade".
       - **Signed up, no entitlement** (`signUp(page.request)`): expect the button "Upgrade to
         Pro". **Don't click it**, because it calls Polar.
    4. **`course-rating.spec.ts`**
       - Add `test.describe.configure({ retries: 0 })`. Ratings are shared per course, so a retry
         would start with 3 ratings. The per-run DB reset covers repeated local runs.
       - **Seed:** create raters A and B, each with `playwright.request.newContext({ baseURL: WEB_URL })`:
         `signUp` → `completeLesson(<reading id>)` → `rateCourse(COURSE, 5)` for A and `4` for B.
         Dispose both contexts. This goes through the real 403 eligibility rule, not bare rating
         rows.
       - **User C:** `signUp(page.request)` + `completeLesson(page.request, <reading id>)`.
       - **UI, keyboard only:**
         1. Goto `/lessons/<reading id>` and expect "Not enough ratings yet" (count 2).
         2. Record PUT `/api/courses/*/rating` requests with `page.on("request")`.
         3. `tabTo(page, getByRole("radio", { name: "Rate 1 out of 5" }))`. This is a local
            helper that presses `Tab` (at most 40 times) until that element is focused.
         4. Press `ArrowRight` three times, then `Enter`.
       - **Expect:**
         - the status "Saved: you rated 4 out of 5"
         - the radio "Rate 4 out of 5" is checked
         - the outline summary is "4.3 ★ (3)", i.e. (5 + 4 + 4) / 3 rounded on the server
         - `expect.poll` for exactly **1** PUT (the debounce plus Enter)
         - `/` shows "4.3 ★ (3)" in the catalog card
    5. **`auth.spec.ts`**
       1. `signUp(request)`, using the standalone `request` fixture so the browser stays signed
          out.
       2. Go to `/login`, fill Email and Password, and click
          `getByRole("button", { name: "Sign in", exact: true })`. Expect the button "Sign out".
       3. Click it. Expect the link "Sign in", and `/api/me` gives `user: null`.
       4. Go to `/login` and click "Forgot password?". Fill Email, click "Send reset link", and
          expect the notice.
       5. `await expect.poll(() => resetLinkFor(email)).not.toBeNull()`, then `page.goto(link)`.
          The link goes through the Vite proxy and redirects to `/reset-password?token=…`.
       6. Expect "Choose a new password". Fill "New password", click "Set password", and expect
          "Password updated".
       7. Sign in with the old password → `.error` visible. Sign in with the new one → "Sign out".
11. **`.gitignore`**: add `e2e/test-results/`, `e2e/playwright-report/`, `e2e/blob-report/` and
    `e2e/.output/`. The reviewer rejects untracked files, and biome follows the ignore file.
12. **`.github/workflows/ci.yml`**: a new job next to `check`:
    ```yaml
    e2e:
      runs-on: ubuntu-latest
      timeout-minutes: 15
      # Non-blocking until it has been reliably green on main; see CLAUDE.md "Running checks".
      continue-on-error: true
      services:
        postgres:
          image: postgres:17
          env: { POSTGRES_USER: fixedstep, POSTGRES_PASSWORD: fixedstep, POSTGRES_DB: fixedstep }
          ports: ["5432:5432"]
          options: >-
            --health-cmd "pg_isready -U fixedstep" --health-interval 2s
            --health-timeout 5s --health-retries 20
      steps:
        - checkout / pnpm/action-setup / setup-node (cache: pnpm) / pnpm install --frozen-lockfile  # as in check
        - id: pw
          run: echo "version=$(node -p "JSON.parse(require('fs').readFileSync('e2e/node_modules/@playwright/test/package.json')).version")" >> "$GITHUB_OUTPUT"
        - uses: actions/cache@v4
          with: { path: ~/.cache/ms-playwright, key: "playwright-${{ runner.os }}-${{ steps.pw.outputs.version }}" }
        - run: pnpm --filter @fixedstep/e2e exec playwright install --with-deps --only-shell chromium
        - run: pnpm e2e
        - if: failure()
          uses: actions/upload-artifact@v4
          with: { name: e2e-report, retention-days: 7, path: "e2e/playwright-report\ne2e/test-results\ne2e/.output" }
    ```
    - The install step always runs: with a cache hit it skips the download but still installs
      the apt deps, which can't be cached. Check that `--only-shell` exists in the pinned version
      (`playwright install --help`); drop it if not.
    - **Gating policy:**
      - It runs on every PR, and on `main`/tags through `deploy.yml`'s `workflow_call`. A
        job-level `continue-on-error`, so a red e2e neither blocks a merge nor fails `check` →
        `deploy`.
      - Path filtering was rejected. It needs a third-party action, makes a later required check
        awkward, and saves only about 5 parallel minutes on docs PRs.
      - **Flip to blocking** once it has had about 10 consecutive green `main` runs: remove
        `continue-on-error` and mark `e2e` required in branch protection (a user action).
13. **`CLAUDE.md` → "Running checks"**: add this bullet after the test bullet, and add `e2e` to
    the tsc package list:
    > - e2e (Playwright, `e2e/`): needs Postgres (`docker compose up -d postgres`) and, once,
    >   Chromium: the user runs `! pnpm --filter @fixedstep/e2e exec playwright install chromium`
    >   (Playwright's CDN isn't an allowed sandbox domain). Agents run exactly
    >   `e2e/node_modules/.bin/playwright test --config e2e/playwright.config.ts`, with no `cd`,
    >   pipes or extra args. It's in `sandbox.excludedCommands` and `permissions.allow` in
    >   `.claude/settings.local.json` and matches only verbatim. It runs outside the sandbox
    >   because a sandboxed command can't reach the host's Postgres on localhost. Don't set
    >   `allowNestedUserNamespaces` for it. Humans and CI: `pnpm e2e`.
    >   - It uses its own DB `fixedstep_e2e` (recreated on every run) and ports 3100/5174.
    >   - Report: `e2e/playwright-report/`. Failure screenshots and traces: `e2e/test-results/`.
    >     API log: `e2e/.output/api.log`.
    >   - The CI `e2e` job is non-blocking for now.
14. **`README.md`**: one row `| e2e | Playwright end-to-end suite (critical journeys) |` in the
    layout table. Under Local development, a two-line "End-to-end tests" note:
    `pnpm db:up`, a one-time `pnpm --filter @fixedstep/e2e exec playwright install chromium`,
    then `pnpm e2e`.

### User steps (drafted in the scratchpad by the implementer, never in the repo)

The implementer writes these to `<scratchpad>/course-tester/`, and the lead gives the user
`diff -u` against the installed files plus the install commands:

- **`course-tester.md`** → `.claude/agents/`.
  - Frontmatter: `name: course-tester`, `tools: Read, Grep, Glob, Bash, Edit, Write`,
    `model: sonnet`, and a description saying "use after `tester` for changes under `apps/web`
    or to an API response the UI reads; edits only `e2e/`".
  - Hooks: the same `PreToolUse` hook as `tester.md`, matcher `Edit|Write|MultiEdit|NotebookEdit`,
    command `…role-guard.sh course-tester`.
  - The body says:
    - Edit only `e2e/` and never production code. Read CLAUDE.md *Running checks*. No
      state-changing git.
    - Run the exact e2e command, after `docker compose up -d postgres` if it isn't running.
    - Essentials only: a new spec must name the critical journey it covers and its runtime
      cost. Prefer extending an existing spec.
    - Seed through `e2e/support/api.ts` with fresh users. Use role/label locators and no
      sleeps.
    - If a spec exposes a bug, leave the failing spec in place.
    - Report each failure with repro steps (URL, inputs, clicks), expected vs actual, the
      screenshot/trace paths under `e2e/test-results/`, and the suspected file. Bugs go to
      `implementer` through the lead.
    - If the command can't reach Postgres, the sandbox exclusion isn't active: stop and ask the
      lead for `! pnpm e2e` output.
- **`role-guard.sh` + `role-guard.test.sh`** → `.claude/hooks/`.
  - Add a `course-tester` role (header comment + `case`): `guard_course_tester` normalizes the
    path like `guard_tester`, then allows only `"$project_dir/e2e"/*` and denies
    `"$project_dir/e2e/node_modules"/*`.
  - New test cases:
    - allow: `/repo/e2e/specs/x.spec.ts`, relative `e2e/support/api.ts`,
      `/repo/e2e/playwright.config.ts`
    - deny: `/repo/apps/web/src/x.tsx`, `/repo/e2e/../apps/api/src/x.ts`, `/repo/e2e-other/x.ts`,
      `/repo/e2e/node_modules/x/index.js`, a NotebookEdit outside `e2e/`
    - deny: a symlink under a temp `e2e/` that points outside it (set `CLAUDE_PROJECT_DIR` to the
      temp dir for that case)
  - Run `bash <scratchpad>/course-tester/role-guard.test.sh` and report the pass count.
- **`SKILL.md`** → `.claude/skills/ship-task/`.
  - Add step **4b. E2E (optional)**: run it when `git diff --name-only origin/main...HEAD`
    touches `apps/web/**` or `e2e/**`, or the diff changes a DTO in `packages/content-schema` or
    an `apps/api/src/routes/*` response the UI reads.
  - What 4b does: run `course-tester` with the task file and that file list. Bugs go back to
    step 3, then `course-tester` runs again. Commit as `<slug>: e2e`.
  - Add `course-tester` to the agent list in the intro.
- **Settings**: the two entries from *Sandbox decision*, appended to the existing
  `permissions.allow` and `sandbox.excludedCommands` arrays.
- **One-time setup:** `! pnpm --filter @fixedstep/e2e add -D -E @playwright/test` (Changes 2)
  and `! pnpm --filter @fixedstep/e2e exec playwright install chromium`.
- **Verify the exclusion** in a new session: have the lead run the exact command once, as a bare
  Bash call (no `cd &&`, `;` or pipes, or it runs sandboxed). The lead confirmed on 2026-10-26
  that `excludedCommands` is honored despite `allowUnsandboxedCommands: false`: a bare
  `git fetch origin` reached GitHub and wrote `.git`. If the run still fails on
  `ECONNREFUSED …5432`, the fallback is `! pnpm e2e`; don't widen anything else.

### Tests and checks

- The 5 specs above are the tests. Run them with the exact e2e command, or `! pnpm e2e`. Run
  the suite **twice in a row**: it must pass both times, which shows the DB reset and the
  independence. Leave `workers` at the default, so the specs run in parallel.
- No vitest changes. `vitest.config.ts`'s `include` doesn't match `e2e/`.
- `role-guard.test.sh` passes, including the new cases (in the scratchpad).
- From CLAUDE.md *Running checks*: `node_modules/.bin/biome check .`, `node_modules/.bin/tsc -p
  <pkg> --noEmit` for every listed package **plus `e2e`**, and the vitest command.

### Risks

- **CLAUDE.md invariants:** no production code changes.
  - Hidden tests, solutions and answers: the specs *assert* the field-by-field DTO rule (the
    quiz keys in spec 2, the 402 body in spec 3).
  - XP is written only through the real submit → `progress.ts` path. No seeding writes
    `lesson_progress` or XP directly.
  - `harnessRuntime` isn't touched.
  - No cloud SDKs: the e2e package uses only Playwright and workspace packages.
- **Unsandboxed execution:** the excluded command runs everything in `e2e/` outside the
  sandbox. The guard limits who edits `e2e/`; the reviewer should read `e2e/` changes,
  especially `start-api.ts` and the `webServer` commands, as code that runs on the host.
- **`excludedCommands` matches only a bare command.** It's honored (verified with `git fetch`),
  but only when the Bash call is exactly the excluded command. The CLAUDE.md bullet and the agent
  body must say so.
- **Better Auth rate limits** apply only when `NODE_ENV=production`. `start-api.ts` must not
  set it, and CI doesn't. With limits on, `/sign-in/anonymous` allows 10 per hour.
- **Host OS:** Playwright's Chromium build isn't officially supported on Arch/CachyOS. It
  usually runs, maybe with a warning. If it doesn't, that's a follow-up (e.g. an
  `executablePath` env override). It's not in scope.
- **Flakiness:**
  - Spec 4 commits with Enter rather than waiting out the 500 ms debounce.
  - Vite's first compile can be slow, which is why the `webServer` timeouts are 60/120 s.
  - CI starts non-blocking.
- **Content coupling:** the specs depend on `content-sample`'s slugs, the solution file and
  the quiz options. A content-sample edit can break e2e. That's intended, and it's noted in
  `env.ts`.

### Optional (not in this branch)

- **A fully sandboxed run with no settings change:** bind-mount the Postgres socket dir into the
  repo in `docker-compose.yml`, and point `E2E_DATABASE_URL` at it with `?host=<abs path>`.
  `allowAllUnixSockets` is already on, and Chromium already runs with `--no-sandbox`. It's
  unproven, so it's a spike.
- **A `course-tester` Bash guard** that blocks state-changing git, like the reviewer allowlist.
- **More journeys:** the completion-card rating prompt, and the rollback when a rating fails.
  Add each only if it justifies its runtime.
