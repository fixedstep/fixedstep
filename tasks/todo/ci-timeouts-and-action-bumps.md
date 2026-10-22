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
