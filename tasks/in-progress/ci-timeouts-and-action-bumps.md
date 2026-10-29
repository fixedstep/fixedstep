# CI jobs have no timeout, and actions still target Node 20

**Area:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
**Origin:** PR #16 CI run (2026-10-22). It hung at "Cleaning up orphan processes", after the
real steps had finished, and the log warned that several actions are being forced from Node 20
onto Node 24.

## Problem

1. **No `timeout-minutes` anywhere.** A stuck job (runner hiccup, a hung test or deploy) runs
   for GitHub's default of 6 hours. That blocks the PR merge check and burns runner minutes.
   `check` normally finishes in under a minute (37s on PR #15).
2. **Actions on Node 20.** GitHub is deprecating Node 20 for actions and currently forces them
   onto Node 24 with a warning
   (https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/).
   Flagged in the warning: `actions/checkout@v4`, `actions/setup-node@v4`,
   `pnpm/action-setup@v4`. `deploy.yml` also uses `google-github-actions/auth@v2`,
   `aws-actions/configure-aws-credentials@v4`, `docker/setup-buildx-action@v3` and
   `pulumi/actions@v6`. Check each of those for the same issue.

## Suggested approach

- Add `timeout-minutes` per job:
  - `ci.yml` → `check`: 15.
  - `deploy.yml` → `deploy`: long enough for an image build plus `pulumi up` on a slow day.
    Check recent run durations (`gh run list --workflow deploy.yml --json ...`) and allow
    roughly 3× the longest.
  - `deploy.yml` → `check` calls `ci.yml` (a reusable workflow), so the job-level timeout
    in `ci.yml` covers it.
- Bump each action to its current major version that runs on Node 24. Read each action's
  release notes for breaking input changes, especially:
  - `pnpm/action-setup`: version pinning comes from `packageManager` in `package.json`.
  - `actions/setup-node`: `node-version-file: .nvmrc` and `cache: pnpm`.
  - The two cloud auth actions, which use OIDC.
- Optionally pin actions to a full commit SHA with a version comment, since `deploy.yml` holds
  cloud credentials.

## Acceptance criteria

- [ ] Every job in `ci.yml` and `deploy.yml` has a `timeout-minutes`, with the deploy value
      justified from real run durations.
- [ ] No Node 20 deprecation warnings in a CI run.
- [ ] CI passes on the PR, and a staging deploy succeeds after merge (OIDC auth on both clouds
      still works).

## Plan

### Scope

- **Covered on this branch:** criterion 1 (timeouts) and criterion 2 (Node 20 warnings) for the
  actions that run on PRs (`checkout`, `setup-node`, `pnpm/action-setup`, `cache`,
  `upload-artifact`). Also the "CI passes on the PR" half of criterion 3.
- **Post-merge only:** the deploy-only actions (`configure-aws-credentials`, `setup-buildx`,
  `pulumi/actions`, `google-github-actions/auth`) run only on a push to `main` or a `v*` tag. The
  lead checks them on the first `main` deploy run after merge: the AWS staging deploy is green,
  and the deploy job has no Node 20 annotations. If that run fails, fix it in a follow-up PR (the
  task stays in `in-progress` until the run is green). Don't revert unless staging is broken.
- **Not verifiable, so flag it rather than fake a pass:** GCP OIDC. Staging and prod both run on
  AWS (`CLOUD=aws`), so `google-github-actions/auth` never runs. Bump it anyway, from the release
  notes alone. When ticking criterion 3, add a note that GCP auth wasn't exercised (no GCP
  stage), and that whoever next brings up a `gcp-*` stage must confirm it. Don't create a new
  task for this without asking the user.
- **Not needed:** a timeout on `deploy.yml`'s `check` job. That job calls a reusable workflow
  (`uses:`), and GitHub doesn't allow `timeout-minutes` there. The per-job timeouts inside
  `ci.yml` apply when it's called. Add a one-line comment saying so.

### Timeout values

| Job | Observed | Value | Why |
|---|---|---|---|
| `ci.yml` `check` | 33–48s | **15** | As the task suggests. That's about 20x the longest run but cheap, and it stays comfortable if `pnpm install` misses the cache. |
| `ci.yml` `e2e` | 1m13s on a cache hit; 8.5, 11.4 and 11.5 min when apt is slow | **25** (was 15) | The slow runs were about 11.5 min, all of it in the `playwright install --with-deps` apt step. 15 leaves about 3 min of headroom, and the job is `continue-on-error`, so a generous limit costs little. 25 is roughly 2x the slowest run. |
| `deploy.yml` `deploy` | 0m57s to 3m09s (the `pulumi up` step ≤ 2m36s); one run spent 60s in OIDC retry | **45** | 3x the longest run (about 10 min) is enough for routine updates. It isn't enough for first stack creation or a prod deploy that creates or modifies RDS or CloudFront, which can take 15–30 min. Killing the job mid-`pulumi up` leaves pending operations and a backend lock in the state, which then needs a manual `pulumi cancel`/`pulumi refresh` under the `concurrency` group. So bias high. 45 min is still far below the 6 h default and below the 2 h `role-duration-seconds` (7200), so credentials never expire before the timeout. |

Put the justification in a short YAML comment above `deploy`'s `timeout-minutes`, e.g.
`# Routine runs take ≤ 3m10s (Oct 2026); 45 leaves room for stack creation or RDS changes. A
timeout mid-pulumi-up leaves a stale lock, so keep this generous.`

### Changes (in order)

1. **Release-notes review (no file change yet).** For each action, read the release notes or
   CHANGELOG for every major between the current and target version. Record the findings as a
   `### Release-notes findings` list appended under this Plan: one line per action, either
   "no breaking change affecting our inputs" or what changed and how you handled it. Specifically
   check:
   - `actions/checkout` v4 → v7: changes to `persist-credentials` (where credentials are stored),
     the minimum runner version, and any changed defaults.
   - `actions/setup-node` v4 → v7: whether `cache: pnpm` and `node-version-file` still exist and
     behave the same. Check the automatic package-manager caching driven by `packageManager` in
     `package.json` (v5+): does it conflict with or replace `cache: pnpm`, and is there a
     `package-manager-cache` input to set? pnpm must stay on PATH before setup-node runs (the
     current step order already ensures this).
   - `pnpm/action-setup` v4 → v6: whether it still reads `packageManager` (`pnpm@10.34.7`) when
     no `version` input is given (we pass none, so keep it that way), plus any change to the
     default `run_install` or to cache or store handling.
   - `google-github-actions/auth` v2 → v3: renamed or removed inputs
     (`workload_identity_provider`, `service_account`), and the default `create_credentials_file`.
   - `aws-actions/configure-aws-credentials` v4 → v6: `role-to-assume`, `aws-region` and
     `role-duration-seconds` are unchanged; check any new default (e.g. retry, `output-env-credentials`,
     or the audience).
   - `docker/setup-buildx-action` v3 → v4: default driver or builder changes. Our Pulumi program
     builds images through buildx, so a change here can break the build.
   - `pulumi/actions` v6 → v7: inputs (`command`, `stack-name`, `work-dir`, `cloud-url`), how
     the Pulumi CLI version is chosen by default (does it now read `infra/package.json` or need
     `pulumi-version`?), and any change to comment or summary output.
   - `actions/cache` v4 → v6: compatibility of the key and path inputs (cache-service backend changes).
   - `actions/upload-artifact` v4 → v7: `include-hidden-files`, `retention-days`, multi-line
     `path`, and any new `archive` or naming behaviour.

   If a target major needs an input change, make it in steps 2–3. If it's unsafe, for example it
   needs a runner or feature we don't have, drop to the newest node24 release of that action and
   note it.

2. **`.github/workflows/ci.yml`**
   - `check`: add `timeout-minutes: 15`.
   - `e2e`: change `timeout-minutes: 15` → `25` and add a comment (the apt deps step can take
     about 11 min).
   - Bump `actions/checkout` → v7.0.1, `pnpm/action-setup` → v6.1.0, `actions/setup-node` →
     v7.1.0, `actions/cache` → v6.1.0 and `actions/upload-artifact` → v7.0.2, pinned as in step 4.
3. **`.github/workflows/deploy.yml`**
   - `check`: comment only (`# timeout-minutes isn't allowed on a reusable-workflow call; ci.yml sets it per job.`).
   - `deploy`: add `timeout-minutes: 45` with the comment above.
   - Bump `checkout`, `pnpm/action-setup` and `setup-node` (same as `ci.yml`), plus
     `google-github-actions/auth` → v3.0.0, `aws-actions/configure-aws-credentials` → v6.3.0,
     `docker/setup-buildx-action` → v4.4.1 and `pulumi/actions` → v7.0.0, pinned as in step 4.
4. **SHA pinning: yes, every `uses:` in both files.** `deploy.yml` holds `id-token: write` and the
   Pulumi passphrase. `ci.yml` also runs under that permission when `deploy.yml` calls it, so pin
   both files, not just `deploy.yml`. Use the form
   `uses: actions/checkout@<40-char commit SHA> # v7.0.1`. Resolve each SHA from the tag's
   **commit**, not from an annotated tag object: on the GitHub tag or release page, or via
   `https://api.github.com/repos/<owner>/<repo>/commits/<tag>` → `.sha`. Record each SHA in the
   findings list. Leave the `postgres:17` service image as it is (out of scope).

No changes to `@fixedstep/content-schema`, the app spec or `infra/`, and no other files.

### Tests / checks

No vitest changes: there's no workflow test harness in the repo, and Biome doesn't lint YAML.

- Run the CLAUDE.md checks to confirm nothing else changed: `node_modules/.bin/biome check .`
- Check by reading: every `uses:` has a 40-hex SHA and a `# vX.Y.Z` comment, the YAML indentation
  is valid, and `timeout-minutes` sits at job level next to `runs-on`.
- On the PR (lead or tester, using `gh run view --log` / the annotations): `check` is green, `e2e`
  runs (it's non-blocking, but confirm the cache and upload-artifact steps still work), and there
  are no "Node.js 20 actions are deprecated" annotations.
- After merge (lead): the `Deploy` run on `main` passes `check` → `deploy` on AWS staging, with no
  Node 20 annotations. Then tick criterion 3 with the GCP note above.

### Risks

- **CLAUDE.md invariants:** none of them are touched. There's no app code, no hidden-tests or
  answers path, no XP writes and no `harnessRuntime` change. No cloud SDKs are added to `apps/`
  or `packages/`; the cloud auth actions live only in the workflow, as they already did.
- **Deploy breakage can only be found after merge.** A breaking input change in
  `configure-aws-credentials`, `setup-buildx` or `pulumi/actions` (e.g. how the CLI version is
  chosen) shows up only on the `main` deploy. Step 1's review is the safeguard, and if the deploy
  fails, fix it in a follow-up PR.
- **Timeout mid-`pulumi up`:** this leaves a stale lock or pending operations. 45 min makes that
  unlikely for routine deploys. If it happens, an operator runs `pulumi cancel` and then
  `pulumi refresh` against the stack before the next deploy.
- **SHA pins don't update themselves.** Without Dependabot they go stale. Optional follow-up
  (not on this branch): add `.github/dependabot.yml` with the `github-actions` ecosystem. Ask
  the user before adding it as a task.
- `.claude/` hooks and settings aren't touched.
