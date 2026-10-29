# Pull a pg dump of an AWS stage's database to a laptop

**Area:** `infra/src/aws/ops.ts`, `scripts/`, README ("Learning metrics" / "Moving between clouds").
**Depends on:** nothing. Related: `reverse-cloud-migration` (its step 1 is the same export
problem; solving it here should close that step too).
**Origin:** user request (2026-10-29): pull a prod database backup and inspect it locally.

## Problem

Backups exist: RDS automated snapshots and point-in-time restore (`backupRetentionDays`: prod 7,
staging 1), deletion protection and a final snapshot on prod. But there's no way to get a copy
*out*:

- RDS snapshots can't be downloaded, and snapshot export to S3 produces Parquet, not a pg dump.
- The database sits in private subnets with no route out, so a laptop can't `pg_dump` it.
- The ops task (`scripts/ops-sql.sh`) can run `pg_dump` inside the VPC, but has no AWS
  credentials (no task role, by design), and busybox `wget` can't PUT to a presigned URL.

## Suggested approach

Pick an export method (options A/B in `reverse-cloud-migration`, step 1): A, `apk add curl` in
the ops task and `curl -T` the dump to a presigned S3 PUT URL, keeps containers free of standing
credentials. Then a `scripts/ops-dump.sh <stack>` that runs it, downloads the dump with
`aws s3 cp`, deletes the S3 copy, and prints how to restore it into the compose Postgres (a
separate database, e.g. `fixedstep_prod_copy`, so it never mixes with dev data).

## Open questions (designer: ask the user)

- The dump holds real users' emails, password hashes and code. Where may it live (laptop only,
  encrypted disk), how long, and should there be a scrubbed variant (emails hashed, sessions and
  tokens dropped) for routine checks?
- Should prod keep more than 7 days of backups, or take a scheduled logical dump to S3?

## Acceptance criteria

- [ ] One command produces a local `.dump` of `aws-staging` or `aws-prod`, with no standing AWS
      credentials in any container and no S3 copy left behind.
- [ ] README steps restore it into a separate local database, and the PII handling decided above
      is documented.
- [ ] Rehearsed on staging, then prod.
