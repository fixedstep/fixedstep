# Groom the backlog: priority prefixes on todo tasks

**Area:** `tasks/` (todo, in-progress, complete), `tasks/README.md` (new),
`.claude/skills/ship-task/SKILL.md`, `CLAUDE.md` (Git flow line)
**Depends on:** nothing.
**Origin:** user request (2026-10-27). Decisions:
- **Buckets, not ranks:** `<n>_<slug>.md` with `n` from 1 (do next) to 5 (someday). Several
  tasks can share a bucket; adding or reprioritising a task renames only that task.
- **Prefix only in `tasks/todo/`:** the slug is the name without the prefix. `/ship-task` takes
  the slug, the branch is `<slug>`, and the file moves to `tasks/in-progress/<slug>.md` (prefix
  stripped). `in-progress/` and `complete/` keep plain names, so existing links don't change.
- **Order agreed with the user** (below).
- **Also review** the stale `tasks/in-progress/email-provider-setup.md`.

## Problem

`tasks/todo/` is an unordered list of nine tasks, so "what's next" lives only in the user's head.
One task (`email-provider-setup`) has sat in `in-progress/` since before 2026-10-27.

## Agreed priorities

| Bucket | Task | Why |
|---|---|---|
| 1 | `game-engine-course` | The user's top pick. |
| 1 | `ci-timeouts-and-action-bumps` | A hung CI job burns Actions minutes; Node 20 deprecation. |
| 1 | `lesson-body-horizontal-scroll` | Small, user-visible bug. |
| 2 | `e2e-firefox` | Land before the CSS migration so both browsers guard it. |
| 3 | `css-in-ts-vanilla-extract` | Large refactor; after `e2e-firefox`. |
| 3 | `achievements` | Feature; no blockers. |
| 4 | `grader-capacity-tuning` | Needs real traffic to tune against. |
| 4 | `content-publish-limits` | GCP Cloud Run only; production is on AWS. |
| 5 | `reverse-cloud-migration` | Only matters for a move back to GCP. |

## Suggested approach

- **Rename** each todo file with `git mv` to `<bucket>_<slug>.md` per the table.
- **Cross-references:** references by slug (`` `e2e-firefox` ``) stay valid. Fix any reference
  by path (e.g. `tasks/todo/e2e-firefox.md` in `tasks/complete/course-ratings-discoverability.md`)
  to the new path, or change it to the slug. Grep `tasks/`, `CLAUDE.md`, `README.md` and
  `.claude/` for every old path.
- **Document the convention** in a short `tasks/README.md`: folders, the `<n>_<slug>.md` todo
  naming, what 1–5 mean, that the prefix is dropped on start, and how to reprioritise (rename
  one file). Point to it from CLAUDE.md's Git flow line ("named after its `tasks/` slug": say the
  slug excludes the priority prefix).
- **`/ship-task` step 1:** accept a slug or a prefixed name, find `tasks/todo/<n>_<slug>.md`
  (or the unprefixed name, for tasks added before this convention), branch `<slug>`, and
  `git mv` it to `tasks/in-progress/<slug>.md`. Note that a new todo task needs a bucket,
  which the user picks.
- **`email-provider-setup`:** check its acceptance criteria against the code and what's
  deployed. If everything is met, tick and move it to `complete/`. Otherwise tick what's done,
  and either leave it in progress with a note on what's blocking it, or move the remainder
  back to `todo/` with a bucket the user agrees to. Ask the user about anything that can only
  be checked outside the repo (DNS, Postmark, AWS).

## Acceptance criteria

- [ ] Every file in `tasks/todo/` is named `<1–5>_<slug>.md`, with buckets as in the table.
- [ ] No reference to an old todo path remains in `tasks/`, `CLAUDE.md`, `README.md` or `.claude/`.
- [ ] `tasks/README.md` documents the convention; CLAUDE.md links to it and says the slug
      excludes the prefix.
- [ ] `/ship-task` step 1 handles prefixed todo files: the branch and the in-progress file use
      the plain slug.
- [ ] `email-provider-setup` is completed, or its remaining work is split out or explained, as
      agreed with the user.
- [ ] Lint passes (docs-only change).

## Plan

### Scope

The branch covers ACs 1–4 and 6. AC 5 (`email-provider-setup`) depends on the user's answers to
the questions below. The lead asks them before the implementer starts on that file. Nothing
else is deferred. There are no code, infra, DTO or cost changes.

### Changes (in order)

1. **Renames.** Run each as a bare `git mv tasks/todo/<old> tasks/todo/<new>` (the lead runs these):

   | Old | New |
   |---|---|
   | `game-engine-course.md` | `1_game-engine-course.md` |
   | `ci-timeouts-and-action-bumps.md` | `1_ci-timeouts-and-action-bumps.md` |
   | `lesson-body-horizontal-scroll.md` | `1_lesson-body-horizontal-scroll.md` |
   | `e2e-firefox.md` | `2_e2e-firefox.md` |
   | `css-in-ts-vanilla-extract.md` | `3_css-in-ts-vanilla-extract.md` |
   | `achievements.md` | `3_achievements.md` |
   | `grader-capacity-tuning.md` | `4_grader-capacity-tuning.md` |
   | `content-publish-limits.md` | `4_content-publish-limits.md` |
   | `reverse-cloud-migration.md` | `5_reverse-cloud-migration.md` |

2. **References to old todo paths.** I grepped `tasks/`, `CLAUDE.md`, `README.md` and `.claude/`.
   Change path references to **slug** references, not to the new prefixed path, so the next
   reprioritisation doesn't break them again:
   - `tasks/complete/course-ratings-discoverability.md:69`: change ``Follow-up: `tasks/todo/e2e-firefox.md`.`` to
     ``Follow-up: task `e2e-firefox`.``
   - `tasks/complete/grader-overload-429.md:78`: change ``tests moved to `tasks/todo/grader-capacity-tuning.md`.`` to
     ``tests moved to task `grader-capacity-tuning`.``
   - `tasks/complete/grader-overload-429.md:92`: change ``**Moved to `tasks/todo/grader-capacity-tuning.md`:**`` to
     ``**Moved to task `grader-capacity-tuning`:**``

   These stay as they are (slug or directory references, still valid):
   - `tasks/todo/1_lesson-body-horizontal-scroll.md:5` (`css-in-ts-vanilla-extract`)
   - `tasks/todo/3_css-in-ts-vanilla-extract.md:60` (`lesson-body-horizontal-scroll`)
   - this file's table and approach text: line 38 quotes the old path as an example, which is
     history, so the verification grep skips this file
   - `SKILL.md:3` (`tasks/todo/` the directory)
   - `.claude/agents/*.md` (`tasks/` only)

   `CLAUDE.md` and `README.md` have no todo paths. `.claude/hooks/role-guard.test.sh:31`
   (`tasks/todo/new.md`) is a made-up fixture in a hook file, so leave it alone.

3. **New `tasks/README.md`** (the full text):

   ```markdown
   # Tasks

   One Markdown file per task, in one of three folders:

   - `todo/`: not started. Named `<n>_<slug>.md`, where `n` is a priority bucket:
     1 do next, 2 soon, 3 planned, 4 later or waiting on something, 5 someday.
     Several tasks can share a bucket. Order within a bucket isn't meaningful.
   - `in-progress/`: on a feature branch. Named `<slug>.md`.
   - `complete/`: merged. Named `<slug>.md`.

   The **slug** is the file name without `.md` and without the `<n>_` prefix. It names the
   branch, and `/ship-task` takes it. Starting a task moves `todo/<n>_<slug>.md` to
   `in-progress/<slug>.md`, dropping the prefix.

   - **New task:** the user picks its bucket.
   - **Reprioritise:** rename that one file (`git mv todo/4_x.md todo/2_x.md`). Nothing else changes.
   - **Linking:** refer to todo tasks by slug (`` `e2e-firefox` ``), not by path, because the
     prefix can change.
   ```

4. **`CLAUDE.md` line 16.** Change
   ``- Git flow: one feature branch per task (named after its `tasks/` slug), squash-merged to `main` ``
   to
   ``- Git flow: one feature branch per task (named after its slug: the `tasks/` file name without the `<n>_` priority prefix; see `tasks/README.md`), squash-merged to `main` ``
   and re-wrap the bullet to 100 columns. The rest stays as it is.

5. **`.claude/skills/ship-task/SKILL.md`**:
   - **Line 7.** Change ``Argument: a task slug (`grader-overload-429`) or path.`` to
     ``Argument: a task slug (`e2e-firefox`), a prefixed todo name (`2_e2e-firefox`) or a path. The slug is the file name without `.md` and without any `<n>_` priority prefix (`tasks/README.md`); the branch, commit prefixes and in-progress file all use it.``
   - **Step 1.** Replace lines 40–41 (from `` `git switch --no-track -c <slug> main`. `` up to `` `tasks/in-progress/`. ``) with:
     ```
        Find the task file: `tasks/todo/<n>_<slug>.md` (`n` is 1–5), or `tasks/todo/<slug>.md`
        for a task added before the prefix convention. If none or several match, or the task is
        already in `tasks/in-progress/`, ask the user.
        `git switch --no-track -c <slug> main`, then
        `git mv tasks/todo/<file> tasks/in-progress/<slug>.md` (the prefix is dropped).
     ```
   - **Step 6.** After "otherwise leave it in `in-progress/`.", add: "If remaining work is split into a new
     `tasks/todo/` task, ask the user for its bucket and link it by slug."
   - Lines 16, 44, 53, 72–73 and 90 use `<slug>`. They're correct once line 7 defines the slug, so
     no edit is needed there.

6. **`email-provider-setup`.** Apply the user's answers to the questions below (see Recommendation).

### `email-provider-setup` review

The app criteria are met in the repo. The code is all present: `apps/api/src/email/{index,send-test,smtp}.ts`
and their tests, `EMAIL_SUBJECT_PREFIX`/`EMAIL_REPLY_TO` in `env.ts` and `infra/src/app-spec.ts`,
and the README section "Email setup (per stage)" (lines 136–217). Unticked criteria:

| AC | What the repo shows | Verifiable from the repo? |
|---|---|---|
| 1. Provider and cost | Postmark is chosen and the reason is in the Plan. No cost is recorded in the task or README. | Partly. The cost is still needed. |
| 2. Domains verified, records documented | Records are documented in README lines 160–183. | Docs: **met**. The SPF/DKIM/DMARC `pass` result can't be checked from the repo. |
| 3. Config on active stacks, no warning | `Pulumi.aws-{staging,prod}.yaml` have the encrypted `SMTP_URL`, `emailFrom` and `emailReplyTo`. GCP yaml has commented `emailFrom` only. Tags `v0.1.0` and `v0.2.0` exist, but whether a prod deploy ran after the email config landed can't be told from the repo. | Config: **met for AWS**. Prod deploy: no. |
| 4. Inbox delivery on both stages | Staging sign-up was delivered on 2026-10-22 (recorded). | No. |

**Questions for the user** (the lead asks them before step 6):
1. Which Postmark plan is the account on, and what does it cost per month? Is staging on the free tier?
2. Has Postmark approved the account (so it delivers outside the From domain)?
3. In a delivered message from each domain, do the headers show `spf=pass`, `dkim=pass` and `dmarc=pass`?
4. Has a `v*` prod deploy run since the `aws-prod` email config was committed, and did `pulumi up`
   print no `SMTP_URL/emailFrom not set` warning?
5. Are the `gcp-*` stacks still active? If not, AWS-only config meets AC 3 ("active stacks").
6. Have staging password reset, prod sign-up and reset, and Gmail/Outlook inbox placement been
   checked?

**Recommendation:**
- If every answer is yes, tick all the criteria (add the cost to AC 1) and `git mv` the file
  to `tasks/complete/`.
- Otherwise, do what `grader-overload-429` did. Tick what's confirmed. Mark each open AC
  "*Moved to task `email-delivery-checks`*". Move this file to `complete/`. Then add
  `tasks/todo/<n>_email-delivery-checks.md` with the open items as ACs: Postmark approval, the
  header pass check, the prod deploy with no warning, the inbox checks, and the cost if it's
  still unknown.
  - Suggested bucket: **2**. Prod password reset to non-`fixedstep.com` addresses can fail
    until Postmark approves, but the work is mostly waiting on a third party. The user picks.
- Keeping it in `in-progress/` with a blocker note is the fallback. It leaves a task in
  progress with no branch, and the backlog grooming exists to avoid that.

### Verification

- Lint: `node_modules/.bin/biome check .`. Biome doesn't process `.md` and ignores `.claude`, so
  it should pass unchanged. Typecheck and vitest aren't needed (no code changes), but the
  reviewer may reuse them.
- Every todo file is prefixed: Glob `tasks/todo/*.md` must list only `[1-5]_*.md` files.
- No old todo path is left: this Grep must return no matches outside this file:
  `todo/(game-engine-course|ci-timeouts-and-action-bumps|lesson-body-horizontal-scroll|e2e-firefox|css-in-ts-vanilla-extract|achievements|grader-capacity-tuning|content-publish-limits|reverse-cloud-migration)\.md`
  Run it over `tasks/`, `CLAUDE.md`, `README.md` and `.claude/` (agents and skills).
- If `email-delivery-checks` is created, check it has a prefix and that
  `email-provider-setup.md` refers to it by slug.

### Risks

- None of the CLAUDE.md invariants are touched: no browser DTOs, XP, `harnessRuntime`, cloud SDKs
  or infra.
- `.claude/hooks/` and `.claude/settings*.json` aren't touched. `SKILL.md` isn't a hook file, so
  it needs no user sign-off beyond the normal review.
- The user's auto-memory `task-tracker.md` describes `tasks/{todo,in-progress,complete}`. It's
  outside the repo, so this branch doesn't edit it. The lead may want to mention the new naming
  to the user.
- If the user rejects the slug-reference choice in step 2, fall back to the new prefixed paths.
  Either way satisfies AC 2.
