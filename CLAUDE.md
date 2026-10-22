# Fixedstep — notes for Claude

- pnpm monorepo; internal packages are consumed as TS source (`exports` → `src/*.ts`), no build step.
  Only `apps/api` (esbuild bundle) and `apps/web` (Vite) build.
- `packages/test-harness/src/runtime.ts`: `harnessRuntime` is serialized with `toString()` and run
  inside QuickJS. Keep it self-contained (no imports/outer references) and capture builtins before
  student code runs. `runtime.test.ts` guards this.
- Never send `lessons.hiddenTests`, `lessons.solution` or quiz `answer`s to the browser; browser
  responses are built field-by-field from `@fixedstep/content-schema` DTOs.
- XP/progress are only written after server-side grading (`apps/api/src/lib/progress.ts`).
- Infra is Pulumi (TS) in `infra/`, one stack per stage. Keep the app cloud-neutral (no cloud
  SDKs in `apps/`/`packages/`); cloud specifics live only in `infra/src/<cloud>/`, which maps
  `infra/src/app-spec.ts`. Stacks are `<cloud>-<stage>` (`gcp-staging`, `aws-prod`, …); keep the
  GCP and AWS targets in step when the app spec changes. Naming: `resourceName(stage, x)` →
  `fixedstep-<stage>-x`.
- Git flow: one feature branch per task (named after its `tasks/` slug), squash-merged to `main`
  via PR, never committed to directly. A PR needs a `reviewer` agent `VERDICT: APPROVE` on its
  current head SHA before merge. The `/ship-task` skill runs designer → implementer → tester →
  reviewer (agents in `.claude/agents/`); see `.claude/skills/ship-task/SKILL.md`.
- Course content is private; only `content-sample/` lives here. `CONTENT_DIR` points the
  `content:*` scripts (and the compose `/content` mount) at the private repo; the content repo
  skeleton is `packages/content-cli/template/` (dotfiles stored as `_name`), used by `init`.

## Running checks (agents and sandbox)

Run these from the repo root, verbatim. Once `.claude/hooks/role-guard.sh` is installed, it
limits the reviewer's Bash to an allowlist that matches them.

- `pnpm` isn't on PATH in the sandbox, so call the tools in `node_modules/.bin` directly:
  - lint: `node_modules/.bin/biome check .` (formatting fixes:
    `node_modules/.bin/biome check --write .`)
  - typecheck: `node_modules/.bin/tsc -p <pkg> --noEmit` for each of `apps/api`, `apps/web`,
    `apps/grader`, `packages/content-schema`, `packages/test-harness`, `packages/db`,
    `packages/content-cli` and `infra` (what `pnpm -r typecheck` covers)
  - test: `node_modules/.bin/vitest run --configLoader runner` (the flag avoids an EROFS on
    `node_modules/.vite-temp`)
- Change files with the Edit/Write tools, not shell redirection or `sed -i`.
- Diff against `origin/main` (`git diff origin/main...HEAD`); local `main` can be stale.
- `.claude/hooks/`, `.claude/settings*.json` and agent `hooks:` frontmatter run outside the
  sandbox: only the user changes them. Agents draft changes in the scratchpad, and the reviewer
  flags any diff touching them for the user's sign-off.
- Only the lead runs state-changing git (commit, branch, switch, push, rebase, reset, stash, add,
  merge, tag). The sandbox also mounts `.git` read-only for agents, so those commands fail anyway.
