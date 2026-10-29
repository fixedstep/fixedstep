# Keep SHA-pinned GitHub Actions up to date

**Area:** `.github/dependabot.yml` (new)
**Origin:** review of `ci-timeouts-and-action-bumps` (2026-10-29). Every action in `ci.yml` and
`deploy.yml` is now pinned to a commit SHA with a `# vX.Y.Z` comment. Nothing bumps those pins,
so they go stale, and security fixes in the actions get missed.

## Suggested approach

- Add `.github/dependabot.yml` with the `github-actions` ecosystem (directory `/`), on a weekly
  schedule. Dependabot updates both the SHA and the version comment.
- Group minor and patch updates into one PR to save CI minutes.
- Decide whether npm dependencies are in scope too, or only actions.

## Acceptance criteria

- [ ] Dependabot opens PRs that bump the pinned actions (SHA plus version comment).
- [ ] Update PRs are grouped so a routine week produces at most one actions PR.
