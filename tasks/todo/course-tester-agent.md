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
