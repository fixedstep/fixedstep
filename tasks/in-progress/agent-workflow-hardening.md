# Harden the agent team so /ship-task runs with less hand-holding

**Area:** `.claude/agents/{designer,implementer,tester,reviewer}.md`,
`.claude/skills/ship-task/SKILL.md`, `CLAUDE.md`
**Origin:** reviewer findings 1, 3 and 4 on PR #14, plus friction from the first `/ship-task` run
(`grader-overload-429`, PR #15) on 2026-10-22.

## Problem

The first run worked, but the lead had to patch around gaps by hand in nearly every agent prompt:

1. **Role limits are only prompts** (PR #14 finding 1). The designer ("only the task file"),
   tester ("only `*.test.ts`") and reviewer ("read-only") all have Bash, so they can write any file
   or run `git commit`. Only `implementer.md` forbids state-changing git; `designer.md` and
   `tester.md` don't. The tester also has Edit/Write with no path limit.
2. **Step 6 re-review is muddled** (PR #14 finding 3). "If this commit came after the approval,
   run reviewer once more" is always true, since step 6 always follows step 5. It also doesn't say
   what happens when that re-review returns `CHANGES_REQUESTED`, or whether it counts toward the
   3-round cap.
3. **No clean-tree precondition for review** (PR #14 finding 4). The reviewer reports
   `git rev-parse HEAD` but runs checks against the working tree, so uncommitted changes make the
   approved SHA differ from what was checked.
4. **Step 7 adds a PR attribution line**, but the user wants no Claude attribution in commits or
   PR bodies.
5. **Sandbox workarounds were re-explained in every agent prompt** during the first run:
   - `pnpm` isn't on PATH in the sandbox. Run tools from `node_modules/.bin`: `biome check .`,
     `tsc -p <pkg> --noEmit`, and `vitest run --configLoader runner`. The flag avoids an EROFS on
     `node_modules/.vite-temp`.
   - Shell writes into the repo can fail (`sed -i` temp files, `.git`), so file changes go through
     the Edit/Write tools.
   - Reviews should diff against `origin/main`, since local `main` can be stale.
6. **Smaller rough edges from the run:**
   - After a squash merge, a branch stacked on the merged one needs
     `git rebase --onto origin/main <old-base>`.
   - A re-review after a docs-only commit can reuse the previous check results. The reviewer did
     this sensibly, but the prompt doesn't allow it.
   - The PR body should summarise every review round, not just the last one.

## Suggested approach

- Add "no state-changing git commands (commit, branch, push, rebase); the lead handles git" to
  `designer.md`, `tester.md` and `reviewer.md`.
- Check whether Claude Code can enforce the path and git limits instead of relying on prompts:
  - Bash permission patterns in an agent's `tools`.
  - `hooks` in agent frontmatter.
  - A PreToolUse hook in `.claude/settings.json` that rejects Edit/Write outside an allowed glob
    for a given agent.

  Use the `claude-code-guide` agent or the docs, and don't guess at fields. If enforcement needs
  `.claude/settings.json` or `.claude/hooks/`, the sandbox can't write those, so write the change
  up for the user to apply.
- Put the sandbox notes (item 5) in one place that every agent reads, e.g. a short
  "Running checks" section in `CLAUDE.md`. Point the agents at it instead of repeating it.
- Rewrite steps 5–7 of `SKILL.md`:
  - Step 5 starts from a clean tree (`git status` empty) and diffs `origin/main...HEAD`.
  - Step 6 always re-reviews. A `CHANGES_REQUESTED` there loops back into step 5 and counts toward
    the 3-round cap.
  - Step 7's PR body has no attribution line and summarises every review round.
- Add the stacked-branch rebase note to `SKILL.md`'s git rules.

## Acceptance criteria

- [ ] `designer.md`, `tester.md` and `reviewer.md` forbid state-changing git commands.
- [ ] Tool-level enforcement of role limits is either in place, or written up here with what
      Claude Code supports and the exact config for the user to apply.
- [ ] SKILL.md step 6 always re-reviews and defines the failure path and the round cap.
- [ ] SKILL.md step 5 requires a clean working tree and reviews `origin/main...HEAD`.
- [ ] SKILL.md step 7 has no attribution line and includes all review rounds.
- [ ] The sandbox check commands are documented once and referenced by the agents, so a lead
      prompt no longer needs to repeat them.
