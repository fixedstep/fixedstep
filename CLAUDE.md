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
    `packages/content-cli`, `infra` and `e2e` (what `pnpm -r typecheck` covers)
  - test: `node_modules/.bin/vitest run --configLoader runner` (the flag avoids an EROFS on
    `node_modules/.vite-temp`)
- e2e (Playwright, `e2e/`): needs Postgres (`docker compose up -d postgres`) and, once,
  Chromium: the user runs `! pnpm --filter @fixedstep/e2e exec playwright install chromium`
  (Playwright's CDN isn't an allowed sandbox domain). Agents run exactly
  `e2e/node_modules/.bin/playwright test --config e2e/playwright.config.ts` as a bare Bash call
  (no `cd &&`, `;`, redirects, pipes or extra args). It's in `sandbox.excludedCommands` and
  `permissions.allow` in `.claude/settings.local.json`, which match only that verbatim command;
  anything else runs sandboxed, and a sandboxed command can't reach the host's Postgres on
  localhost. Don't set `allowNestedUserNamespaces` for it. Humans and CI: `pnpm e2e`.
  - It uses its own DB `fixedstep_e2e` (recreated on every run) and ports 3100/5174.
  - Report: `e2e/playwright-report/`. Failure screenshots and traces: `e2e/test-results/`.
    API log: `e2e/.output/api.log`.
  - The CI `e2e` job is non-blocking for now.
- Change files with the Edit/Write tools, not shell redirection or `sed -i`.
- Diff against `origin/main` (`git diff origin/main...HEAD`); local `main` can be stale.
- `.claude/hooks/`, `.claude/settings*.json` and agent `hooks:` frontmatter run outside the
  sandbox: only the user changes them. Agents draft changes in the scratchpad, and the reviewer
  flags any diff touching them for the user's sign-off.
- Only the lead runs state-changing git; agents never do. `sandbox.excludedCommands` in
  `.claude/settings.local.json` runs `git fetch|pull|switch|add|commit|mv|push|restore|rm` and
  `gh pr|run` outside the sandbox, but only as a bare command (no `cd &&`, `;`, redirects or
  pipes), so the lead runs those itself, one per Bash call. Anything else (rebase, reset, stash,
  merge, tag; `git config`/`-c` are denied) goes to the user with `!`. `.git` is otherwise
  read-only to sandboxed commands.
