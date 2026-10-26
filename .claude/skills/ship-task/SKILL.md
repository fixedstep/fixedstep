---
name: ship-task
description: Take a task from tasks/todo/ through design, implementation, testing and agent review on its own feature branch, ending in a PR that carries the reviewer's sign-off. Use when the user says "ship", "work on" or "do" a task from tasks/.
---
# Ship a task

Argument: a task slug (`grader-overload-429`) or path. You are the lead: you run git and
coordinate the `designer`, `implementer`, `tester`, `course-tester` and `reviewer` agents. Pass
each agent the task file path and what the previous step produced. They share no context with
you or each other.
They all read CLAUDE.md's *Running checks* for the sandbox check commands, so don't repeat those
in their prompts.

## Git rules

- One feature branch per task, named after the slug, cut from an up-to-date `main`. Never commit
  to `main`, and never merge locally.
- Every change reaches `main` through a PR, squash-merged, and only after the `reviewer` agent
  has returned `VERDICT: APPROVE` for the PR's **current head SHA**. Any push after the approval
  needs a fresh review.
- Commit as the user's configured git identity. No `Co-Authored-By` trailers.
- Only you run state-changing git; agents never do. `sandbox.excludedCommands` lists
  `git fetch|pull|switch|add|commit|mv|push|restore|rm *` and `gh pr|run *`, so run those
  yourself, one bare command per Bash call (no `cd &&`, `;`, redirects or pipes, or it runs
  sandboxed and fails).
  Anything else (rebase, reset, stash, merge, tag; `git config`/`-c` are denied) goes to the user:
  give the exact command with the `!` prefix and wait. Batch those so they're asked as rarely as
  possible. `.git` is otherwise read-only to sandboxed commands. Create branches with
  `--no-track`.
- After a squash merge, rebase a branch that was stacked on the merged one with
  `git rebase --onto origin/main <old-base>`.
- Hooks run outside the sandbox. Neither you nor any agent writes `.claude/hooks/`,
  `.claude/settings*.json`, or the `hooks:` block of an agent file. Draft hook changes in the
  scratchpad and hand the user the install command after they've read the script.

## Steps

1. **Branch.** Check `git status` is clean. Run `git fetch origin` (and `git pull` if `main`
   may be stale) so `origin/main` is current.
   `git switch --no-track -c <slug> main`. Move the task file from `tasks/todo/` to
   `tasks/in-progress/`.
2. **Design.** Run `designer` on the task file. Read the plan it appends. If it defers acceptance
   criteria or proposes infra/cost changes, confirm the scope with the user before going on.
   Commit: `<slug>: plan`.
3. **Implement.** Run `implementer` with the task file. Review its report, then commit.
4. **Test.** Run `tester`. If it reports a bug in production code, send that back to
   `implementer` (step 3). Commit the tests.

   **4b. E2E (optional).** Run it when `git diff --name-only origin/main...HEAD` touches
   `apps/web/**` or `e2e/**`, or the diff changes a DTO in `packages/content-schema` or an
   `apps/api/src/routes/*` response the UI reads. Run `course-tester` with the task file and that
   file list. If it reports a bug, send it back to `implementer` (step 3), then run
   `course-tester` again. Commit: `<slug>: e2e`.
5. **Review.** Before each round, `git status --porcelain` must be empty; commit first. Run
   `reviewer` on `origin/main...HEAD`. On `CHANGES_REQUESTED`, send the findings to
   `implementer`, commit, and review again. Keep a round log: round number, HEAD, verdict, and a
   one-line summary of each finding with how it was resolved.
6. **Finish the task file.** Tick the acceptance criteria that are met. For any left open (e.g.
   staging load tests), keep them unticked with a note. Move the file to `tasks/complete/` only
   if every criterion is met; otherwise leave it in `in-progress/`. Commit. Then **always** run
   `reviewer` again on the new HEAD, passing the previous approved SHA and its check results so
   it can reuse them for a docs-only change. `APPROVE` goes to step 7. `CHANGES_REQUESTED` goes
   back into step 5's loop (and step 6 runs again after it approves).

   **Round cap:** at most 3 `CHANGES_REQUESTED` verdicts in total across steps 5 and 6. After
   the third, stop and bring the open findings to the user. Approving rounds don't count.
7. **PR.** Write the PR body to the scratchpad: summary, the task file link, the deferred
   criteria, and under `## Agent review` one entry per round from the round log, followed by the
   final reviewer output in full. No attribution or `Co-Authored-By` lines. Then run, each as
   its own bare Bash call:
   ```
   git push -u origin <slug>
   gh pr create --base main --head <slug> --title "<title>" --body-file <scratchpad path>
   ```
8. **Merge.** Merging is the user's call. Before suggesting
   `! gh pr merge <slug> --squash --delete-branch`, confirm the PR head SHA still matches the
   approved `HEAD:` line, and that CI is green. If the final review lists `Human sign-off
   required`, put those paths in the PR body and get the user's explicit OK on them first.
