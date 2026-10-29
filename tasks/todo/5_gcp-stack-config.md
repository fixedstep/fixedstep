# GCP stacks: config and live checks to do before switching over

**Area:** `infra/Pulumi.gcp-staging.yaml`, `infra/Pulumi.gcp-prod.yaml`, `infra/src/gcp/`.
**Depends on:** a decision to run on GCP. Related: `reverse-cloud-migration` (the data move and
secret pinning), `grader-capacity-tuning` (GCP budget alert).
**Origin:** user request (2026-10-29): GCP isn't deployed, so the GCP halves of other tasks'
checks are collected here instead of left open in each one.

## Problem

Only `aws-staging` and `aws-prod` are deployed. The `gcp-*` stacks hold just `gcp:region`, so
every setting added to the AWS stacks since then is missing, and no GCP-side live check has run.

## Checklist

Stack config, matching `Pulumi.aws-<stage>.yaml` (plain values in the yaml, secrets with
`pnpm infra config set --secret -s gcp-<stage> <KEY>`):

- `gcp:project` (see the comment at the top of each `gcp-*` yaml).
- `emailFrom`, `emailReplyTo`, and the `SMTP_URL` secret (task `email-provider-setup`).
- `posthogKey` (task `analytics-live-check`; the same public key as AWS, one shared project).
- Provider secrets: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `POLAR_ACCESS_TOKEN`,
  `POLAR_WEBHOOK_SECRET`, `POLAR_PRO_MONTHLY_PRODUCT_ID`, `POLAR_PRO_YEARLY_PRODUCT_ID`.
  The GitHub OAuth callback and the Polar webhook URL must point at the GCP-served host.
- Pinned `BETTER_AUTH_SECRET` and `CONTENT_SYNC_TOKEN` when moving an existing stage (see
  `reverse-cloud-migration`, step 3).
- Budget alert: AWS has `budgetAlertEmail` (`infra/src/aws/budget.ts`); GCP has no budget in
  infra (see `grader-capacity-tuning`).

Checks after the first GCP deploy:

- `pnpm infra preview -s gcp-<stage>` shows only expected changes.
- `/api/config` serves the analytics block, and PostHog Live events show `stage=<stage>`.
- No `SMTP_URL/emailFrom not set` warning on `up`; verification and reset emails arrive.
- Before switching, check `git log -- infra/Pulumi.aws-*.yaml` and `tasks/complete/` for settings
  or checks added after this task was written.

## Acceptance criteria

- [ ] Each `gcp-<stage>` stack carries every setting its `aws-<stage>` counterpart does, or the
      difference is noted here with a reason.
- [ ] The checks above pass on `gcp-staging`, then on `gcp-prod`.
