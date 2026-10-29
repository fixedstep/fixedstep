# Live checks for the CI action bumps

**Area:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`
**Origin:** split from `ci-timeouts-and-action-bumps` (2026-10-29). That branch bumped every
action to a node24 major (SHA-pinned) and added job timeouts. These checks can only be made on
GitHub, from the PR's CI run and the deploy runs after merge. Related: `gcp-stack-config`
(GCP-side checks are collected there).

## Acceptance criteria

- [ ] No Node 20 deprecation warnings in a CI run (the PR's `check`/`e2e` jobs) or in the
      first `main` Deploy run's `deploy` job.
- [ ] CI passes on the `ci-timeouts-and-action-bumps` PR, and the first staging deploy after
      merge succeeds (AWS OIDC via `aws-actions/configure-aws-credentials` v6.3.0, buildx v4.4.1,
      `pulumi/actions` v7.0.0). `pnpm/action-setup` v6 installs pnpm 10.34.7 from
      `packageManager`.
- [ ] GCP OIDC auth (`google-github-actions/auth` v3.0.0) works the next time a `gcp-*` stage is
      deployed. It wasn't exercised when bumped, because no stage runs on GCP.
