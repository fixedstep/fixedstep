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

- [x] `designer.md`, `tester.md` and `reviewer.md` forbid state-changing git commands.
- [x] Tool-level enforcement of role limits is either in place, or written up here with what
      Claude Code supports and the exact config for the user to apply.
- [x] SKILL.md step 6 always re-reviews and defines the failure path and the round cap.
- [x] SKILL.md step 5 requires a clean working tree and reviews `origin/main...HEAD`.
- [x] SKILL.md step 7 has no attribution line and includes all review rounds.
- [x] The sandbox check commands are documented once and referenced by the agents, so a lead
      prompt no longer needs to repeat them.

## Plan

### Scope

All six criteria are covered on this branch. For criterion 2, the deliverable is the write-up in
`## Enforcement` below, plus any enforcement that lives in agent frontmatter, which this branch
can write. Anything that needs `.claude/settings.json` or `.claude/hooks/` is written up for the
user to apply. The sandbox can't write those, so applying them is deferred to the user.

Two things to know before starting:
- **SKILL.md may not be writable.** The sandbox lists `.claude/skills` as deny-write, next to
  `settings.json` and `hooks/`. Before the implementer starts, confirm whether the Edit tool can
  write `.claude/skills/ship-task/SKILL.md`. If it can't, the implementer writes the full new
  file to the scratchpad and the lead hands the user a `! cp <scratchpad>/SKILL.md
  .claude/skills/ship-task/SKILL.md`. Check `.claude/agents/` the same way; it isn't in the
  visible deny list, but that list is truncated.
- **New prompts only load in a new session**, so this branch's own review runs on the old
  `reviewer.md`. The lead should pass `origin/main...HEAD` and a clean tree by hand.

### Open questions for the lead (answer from the docs before implementing)

1. Does an agent's `tools` frontmatter accept permission-rule patterns such as
   `Bash(git diff:*)`, or only bare tool names? If it does, does a pattern still restrict Bash
   when `sandbox.autoAllowBashIfSandboxed: true` is set (as in `settings.local.json`), and how
   are compound commands (`cd x && git diff`) matched?
2. Does agent frontmatter support a `hooks` key? If so, what is the schema (same shape as
   `settings.json` `hooks.PreToolUse[].matcher/hooks[].command`?), and do those hooks fire only
   for that subagent's tool calls?
3. What JSON does a PreToolUse hook get on stdin? In particular, is there a field that
   identifies the calling subagent (name/type/id), or a way to tell a subagent call from a lead
   call? Without one, a hook in `settings.json` can't scope rules per role.
4. How does a PreToolUse hook block a call: exit code 2 with stderr shown to the model, or JSON
   `{"hookSpecificOutput":{"permissionDecision":"deny","permissionDecisionReason":…}}`? Which
   tool_input fields carry the path (`file_path` for Edit/Write; `MultiEdit`/`NotebookEdit`?)?
5. Are `$CLAUDE_PROJECT_DIR` and `jq` available to hook commands? (Check `jq` on this machine;
   otherwise the script uses `node`.)
6. Can the Edit tool write `.claude/skills/**` and `.claude/agents/**` from this sandbox? (See
   Scope.)

### Changes (in order)

1. **`CLAUDE.md`**: add a short `## Running checks (agents and sandbox)` section after the
   bullets. It is the single source the agents point to:
   - `pnpm` isn't on PATH in the sandbox. Use `node_modules/.bin/biome check .`,
     `node_modules/.bin/tsc -p <pkg> --noEmit` for each of `apps/{api,web,grader}`,
     `packages/{content-schema,test-harness,db,content-cli}` and `infra` (that's what
     `pnpm -r typecheck` covers), and `node_modules/.bin/vitest run --configLoader runner`. The
     flag avoids an EROFS on `node_modules/.vite-temp`. Formatting fixes:
     `node_modules/.bin/biome check --write .`.
   - Change files with the Edit/Write tools, not shell redirection or `sed -i`.
   - Diff against `origin/main` (`git diff origin/main...HEAD`); local `main` can be stale.
   - Only the lead runs state-changing git (commit, branch, switch, push, rebase, reset, stash,
     add, merge, tag).
   Also update the existing Git flow bullet to say "see `.claude/skills/ship-task/SKILL.md`".
2. **`.claude/agents/designer.md`**: add "Read CLAUDE.md's *Running checks*." and "No
   state-changing git commands (commit, branch, push, rebase); the lead handles git." Change
   `tools` to `Read, Grep, Glob, Edit`. Dropping Bash is real enforcement with no config
   questions: the designer only reads. Add enforcement per branch (a) if it applies.
3. **`.claude/agents/tester.md`**: same git line and CLAUDE.md pointer. Replace the `pnpm lint/
   typecheck/test` step with "run the checks in CLAUDE.md *Running checks*". Diff
   `origin/main...HEAD`. Add enforcement per branch (a) if it applies.
4. **`.claude/agents/reviewer.md`**:
   - Default range `origin/main...HEAD`.
   - Precondition: run `git status --porcelain` first. If it isn't empty, don't review; return
     `VERDICT: CHANGES_REQUESTED` with a single `[blocker]` finding that lists the dirty paths.
   - Add the git line and the CLAUDE.md pointer; checks come from *Running checks*.
   - Reuse rule: if the lead passes a previous approved SHA plus its check results, and
     `git diff --name-only <prev>..HEAD` touches only `*.md` files, the reviewer may reuse those
     checks. It reads the new diff anyway and writes `Checks: reused from <sha> (docs-only
     change)`.
   - Add enforcement per branch (a) if it applies.
5. **`.claude/agents/implementer.md`**: point at *Running checks* instead of `pnpm …` (and
   `biome check --write` instead of `pnpm format`). Extend the git list to "commit, branch,
   push, rebase". No tools change.
6. **`.claude/skills/ship-task/SKILL.md`**:
   - Git rules: add "After a squash merge, rebase a branch that was stacked on the merged one
     with `git rebase --onto origin/main <old-base>`." In step 1, add `! git fetch origin` to the
     user's batch, so `origin/main` is current.
   - **Step 5**: before each round, `git status --porcelain` must be empty (commit first). Run
     `reviewer` on `origin/main...HEAD`. On `CHANGES_REQUESTED`, send the findings to
     `implementer`, commit, and review again. Keep a round log: round number, HEAD, verdict, and
     a one-line summary of each finding plus how it was resolved.
   - **Step 6**: tick the criteria and move the file as now, then commit. **Always** run
     `reviewer` again on the new HEAD, passing the previous approved SHA and its check results,
     so the docs-only reuse rule can apply. `APPROVE` goes to step 7. `CHANGES_REQUESTED` goes
     back into step 5's loop.
   - **Round cap**: at most 3 `CHANGES_REQUESTED` verdicts in total across steps 5 and 6. After
     the third, stop and bring the open findings to the user. An approving round doesn't count
     toward the cap.
   - **Step 7**: the PR body has a summary, the task link, and the deferred criteria. Under
     `## Agent review`, add one entry per round from the log, then the final reviewer output in
     full. Remove the attribution sentence and add "No attribution or `Co-Authored-By` lines".
7. **This task file**: add `## Enforcement`, the write-up for criterion 2 (see below), filled in
   with what the docs confirmed.

### Enforcement: branch (a), supported

- If Q1 is yes: limit Bash by pattern in `tools`.
  - reviewer: `Read, Grep, Glob, Bash(git status:*), Bash(git diff:*), Bash(git log:*),
    Bash(git show:*), Bash(git rev-parse:*), Bash(node_modules/.bin/biome check .),
    Bash(node_modules/.bin/tsc:*), Bash(node_modules/.bin/vitest run:*)`.
  - tester: the same Bash set, plus `Edit, Write`.
  - Check that the prompts' commands match the patterns exactly (no `cd … &&` prefixes).
    *Running checks* should then say "run these from the repo root, verbatim".
- If Q2 is yes: add a PreToolUse hook in the frontmatter of designer and tester:
  `matcher: "Edit|Write|MultiEdit|NotebookEdit"`, command
  `"$CLAUDE_PROJECT_DIR"/.claude/hooks/role-guard.sh <role>`. The hook allows only these paths:
  designer `tasks/**/*.md`, tester `**/*.test.ts` and `**/*.test.tsx`. Add a `Bash` matcher on
  tester and reviewer (and on designer, if it keeps Bash) using the same script. It denies
  `\bgit\b.*\b(commit|push|branch|switch|checkout|rebase|reset|merge|tag|stash|add|restore|clean|
  cherry-pick|revert|pull|fetch|config|worktree)\b`.
- If Q2 is no but Q3 gives a subagent identifier: put the same matchers in
  `.claude/settings.json` `hooks.PreToolUse`. The script switches on that field and allows
  anything from the lead or the implementer.
- In both hook cases, `role-guard.sh` lives in `.claude/hooks/`, which the sandbox can't write.
  The implementer drafts it in the scratchpad (reading stdin JSON with `jq` or `node`, blocking
  per Q4), and the lead gives the user the `! mkdir -p .claude/hooks && cp … && chmod +x …`
  commands, plus the `settings.json` snippet if needed. Frontmatter hooks that reference a
  missing script would break every tool call. Either commit them only after the user confirms
  the script exists, or make the command a no-op when the file is missing (`[ -x … ] || exit 0`).
- Known gap: Bash can still write files (`echo > x`) for any role that has unrestricted Bash.
  Pattern-limited `tools` (Q1) is what closes this for reviewer and tester. Say so in the
  write-up.

### Enforcement: branch (b), not supported

Keep the prompt-level limits from Changes 2–5, plus the one piece that needs no config: no Bash
for the designer. In `## Enforcement`, record what each question's answer was (with doc links),
and why per-role enforcement isn't possible. Give the closest option the user could apply: for
example, a `settings.json` `permissions.deny` for `Bash(git push:*)`. That rule hits the lead
too, and the lead already hands push to the user. Mark criterion 2 met via the write-up.

### Tests

There's no code, so no vitest changes. To verify:
- `grep -n "pnpm" .claude/agents/*.md` should show nothing outside an explicit "not on PATH"
  note.
- `grep -n "attribution" .claude/skills/ship-task/SKILL.md` should only find the "no
  attribution" rule.
- `node_modules/.bin/biome check .` still passes.
- If a hook script is drafted: pipe sample PreToolUse JSON into it (Edit on `apps/api/src/x.ts`
  as tester → deny; `apps/api/src/x.test.ts` → allow; `git commit` as reviewer → deny;
  `git diff` → allow), and record the results in the report.
- After merge, a fresh session's next `/ship-task` run is the real test. Note that in the PR
  body.

### Risks

- None of the CLAUDE.md code invariants are touched (DTO leaks, `progress.ts`,
  `harnessRuntime`, cloud SDKs). Reviewer and tester prompts must keep their invariant
  checklists word for word; only the check commands and diff base change.
- Over-tight Bash patterns or hooks could stop the reviewer or tester from running checks,
  which would wedge `/ship-task`. Keep the pattern list and the *Running checks* commands in
  lockstep.
- Frontmatter hooks that point at a script the user hasn't installed yet. See the no-op guard
  above.
- Writes to SKILL.md or the agents could be blocked by the sandbox (Q6). That's a fallback,
  not a blocker.

## Enforcement

Branch (a) applies. What the Claude Code docs say
([sub-agents](https://code.claude.com/docs/en/sub-agents.md),
[hooks](https://code.claude.com/docs/en/hooks.md),
[permissions](https://code.claude.com/docs/en/permissions.md)):

1. **`tools` patterns:** no. An agent's `tools` takes bare tool names only; `Bash(git diff:*)`
   patterns there aren't documented. `disallowedTools` removes whole tools (a specifier still
   removes the whole tool), and there's no per-agent `permissions` field. So Bash can't be
   narrowed with frontmatter permissions.
2. **Frontmatter `hooks`:** yes. They use the same schema as `settings.json` hooks
   (`PreToolUse[].matcher` + `hooks[].type/command`) and run only while that subagent is active.
3. **Subagent identity in hook input:** settings-level hooks get `agent_type`, but frontmatter
   hooks make that unnecessary.
4. **Blocking:** exit 2 blocks the call and shows stderr to the agent; exit 0 allows it. The
   path is `tool_input.file_path` for Edit/Write/MultiEdit and `tool_input.notebook_path` for
   NotebookEdit.
5. **`jq` and `$CLAUDE_PROJECT_DIR`:** both are available (`jq` 1.8.2 at `/usr/bin/jq`).
6. **Sandbox writes:** the Edit/Write tools can write `.claude/agents/**` and `.claude/skills/**`.
   Nothing can write `.claude/hooks/` or `.claude/settings*.json` from the sandbox, and hook
   scripts run outside it, so the user installs the script.

### What's enforced

| Role | Limit | How |
| --- | --- | --- |
| designer | No shell | `tools: Read, Grep, Glob, Edit` (enforced now) |
| designer | Edits only `tasks/**/*.md` | frontmatter hook → `role-guard.sh designer` |
| tester | Edit/Write only `*.test.ts` / `*.test.tsx` | frontmatter hook → `role-guard.sh tester` |
| reviewer | No Edit/Write | `tools: Read, Grep, Glob, Bash` (enforced now) |
| reviewer | Bash limited to a read-only allowlist | frontmatter hook (`Bash`) → `role-guard.sh reviewer` |
| all agents | No state-changing git | sandbox: `.git` is read-only for every session (lead included); prompts say why |

The reviewer allowlist splits commands on unquoted `&&`, `||`, `;`, `|`, `&` and newlines, and
every segment must start with an allowed command: `git diff/log/show/status/rev-parse/
check-ignore/ls-files/merge-base`, `cd`, `pwd`, `echo`, `ls`, `cat`, `head`, `tail`, `wc`,
`sort`, `diff`, `grep`, `rg`, `find`, `sed --sandbox -n` (sed only in that form, so GNU sed itself
rejects `e`/`w`/`W`/`r`/`R` and `s///e`/`s///w`), `jq`, `node_modules/.bin/biome check`,
`node_modules/.bin/tsc … --noEmit`, `node_modules/.bin/vitest run`, and `pnpm lint/typecheck/
test`. It blocks:

- output redirection (other than to `/dev/null` or another fd), command substitution, process
  substitution `<(…)`, and ANSI-C quoting `$'…'` (which its quote parser doesn't model);
- leading `VAR=value` assignments other than `CI`, `NO_COLOR`, `FORCE_COLOR`, `TERM`, `LC_ALL`
  and `LANG` (so `GIT_PAGER`, `GIT_EXTERNAL_DIFF`, `GIT_CONFIG_*`, `LD_PRELOAD` are out);
- `tee`, `sort -o/--output/--compress-program`, `sed -i`/`--in-place` in any spelling
  (`--sandbox` doesn't block it), `find -delete/-exec/-ok/-fprint*/-fls`, `rg --pre`,
  `-u`/`--update` for vitest and `pnpm` (which forwards it to vitest);
- per command: `--write/--fix/--apply/--apply-unsafe` for biome (and `pnpm`, which forwards
  them), `--out…` for git and vitest (`--output`, `--outputFile`). Search text that merely
  contains those flags (`grep 'biome check --write'`) is allowed.

The `./` and `$CLAUDE_PROJECT_DIR/` prefixes are only stripped when what follows is
`node_modules/.bin/…`. The tester's path check resolves `..` and symlinks before matching
`*.test.ts(x)`, like the designer's.

The frontmatter hook command is a no-op until the script is installed:
`f="$CLAUDE_PROJECT_DIR/.claude/hooks/role-guard.sh"; [ -x "$f" ] || exit 0; exec "$f" <role>`.
The script also fails open (exit 0 with a warning) on an unknown role or input it can't parse,
so a broken guard can't wedge an agent.

### Prompt-only (known gaps)

- The guard is a check against mistakes, not a security boundary. The reviewer rules above
  cover the bypasses found in review so far, but string matching can't model everything a shell
  or an allowed tool can do (e.g. options a tool reads from config files), and flag checks such
  as sed's `-i` can false-positive on search text that looks like a flag.
- The tester's Bash is unrestricted, so it could still write non-test files from the shell. Its
  prompt forbids that. If it turns out to matter, the reviewer allowlist could also be applied
  to the tester's `Bash` matcher.
- The implementer has no limits beyond its prompt (it edits code by design).
- New agent prompts and hooks load only in a new session.

### For the user to apply

`role-guard.sh` and its test harness `role-guard.test.sh` are installed and committed at
`.claude/hooks/` (mode 755). No `settings.json` change is needed.

The sandbox can't write `.claude/hooks/`, so future changes follow the same path: an agent
drafts both files in the session scratchpad and runs `bash <scratchpad>/role-guard.test.sh`, the
user reviews the `diff -u` against `.claude/hooks/`, then installs them:

```
! install -m 755 <scratchpad>/role-guard.sh <scratchpad>/role-guard.test.sh .claude/hooks/
```

The current version passes 145 cases.
