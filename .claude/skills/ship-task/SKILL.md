---
name: ship-task
description: Take a task from tasks/todo/ through design, implementation, testing and agent review on its own feature branch, ending in a PR that carries the reviewer's sign-off. Use when the user says "ship", "work on" or "do" a task from tasks/.
---
# Ship a task

Argument: a task slug (`grader-overload-429`) or path. You are the lead: you run git and
coordinate the `designer`, `implementer`, `tester` and `reviewer` agents. Pass each agent the task
file path and what the previous step produced. They share no context with you or each other.

## Git rules

- One feature branch per task, named after the slug, cut from an up-to-date `main`. Never commit
  to `main`, and never merge locally.
- Every change reaches `main` through a PR, squash-merged, and only after the `reviewer` agent
  has returned `VERDICT: APPROVE` for the PR's **current head SHA**. Any push after the approval
  needs a fresh review.
- Commit as the user's configured git identity. No `Co-Authored-By` trailers.
- The sandbox can't write `.git`, reach GitHub or run `gh`. When a git or `gh` command fails for
  that reason, give the user the exact command to run with the `!` prefix and wait for them to
  run it. Batch these so they're asked as rarely as possible. Create branches with `--no-track`.

## Steps

1. **Branch.** Check `git status` is clean and `main` is current (ask the user to
   `! git pull` if unsure). `git switch --no-track -c <slug> main`. Move the task file from
   `tasks/todo/` to `tasks/in-progress/`.
2. **Design.** Run `designer` on the task file. Read the plan it appends. If it defers acceptance
   criteria or proposes infra/cost changes, confirm the scope with the user before going on.
   Commit: `<slug>: plan`.
3. **Implement.** Run `implementer` with the task file. Review its report, then commit.
4. **Test.** Run `tester`. If it reports a bug in production code, send that back to
   `implementer` (step 3). Commit the tests.
5. **Review.** Run `reviewer` on `main...HEAD`. On `CHANGES_REQUESTED`, send the findings to
   `implementer`, commit, and review again. Stop after 3 rounds and bring the remaining findings
   to the user.
6. **Finish the task file.** Tick the acceptance criteria that are met. For any left open (e.g.
   staging load tests), keep them unticked with a note. Move the file to `tasks/complete/` only
   if every criterion is met; otherwise leave it in `in-progress/`. Commit. If this commit came
   after the approval, run `reviewer` once more so the approval covers the final SHA.
7. **PR.** Write the PR body to the scratchpad: summary, the task file link, the deferred
   criteria, and the reviewer's full output under `## Agent review`, ending with the
   pull-request attribution line from the system prompt. Hand the user:
   ```
   ! git push -u origin <slug>
   ! gh pr create --base main --head <slug> --title "<title>" --body-file <scratchpad path>
   ```
8. **Merge.** Merging is the user's call. Before suggesting
   `! gh pr merge <slug> --squash --delete-branch`, confirm the PR head SHA still matches the
   approved `HEAD:` line, and that CI is green.
