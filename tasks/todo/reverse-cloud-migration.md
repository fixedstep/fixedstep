# Script the AWS → GCP migration path

**Area:** README "Moving between clouds", `infra/src/aws/ops.ts`, possibly `infra/src/gcp/`
**Origin:** AWS provider work (2026-10-21)

## Problem

The README runbook gives exact steps for **GCP → AWS** only and says the reverse "uses the same
plan". The database copy is the step that doesn't simply mirror:

- **Getting the dump out of AWS.** The RDS/Aurora database sits in private subnets with no route
  out, so a laptop can't `pg_dump` it directly. The ops task (`fixedstep-<stage>-ops`, a
  `postgres:17-alpine` container on the API's network) can run `pg_dump`. However, busybox
  `wget` can't PUT the result to a presigned S3 URL, and the task has no AWS credentials (no task
  role, by design).
- **Getting the dump into GCP.** Cloud SQL has only a private IP. The GCP → AWS steps reach it
  with a temporary public IP plus the Cloud SQL Auth Proxy, which works for a restore too. The
  restore steps and the "wipe the empty schema first" step still need writing for GCP.

## Suggested approach

1. **Export from AWS.** Pick one of these:
   - **A.** Run the ops task with an `apk add curl` override and `curl -T` the dump to a
     presigned S3 PUT URL (`aws s3 presign` only makes GET URLs, so generate the PUT URL with a
     short SDK/CLI snippet), or
   - **B.** Give the ops task a narrow task role that can `s3:PutObject` to a single
     `migration/` prefix in the state bucket, and use `aws s3 cp` from an image that has the AWS
     CLI. This means a second container image or `apk add aws-cli`.
   - **C.** Use an RDS/Aurora snapshot export. It exports to Parquet, not a pg dump, so it's
     probably not useful here.

   A looks smallest and keeps the "no AWS credentials in containers" property.
2. **Import into GCP.** Use the Auth Proxy route from the existing runbook: temporarily
   `--assign-ip`, run `cloud-sql-proxy`, then `psql` to drop and recreate the `public` and
   `drizzle` schemas, then `pg_restore --no-owner --no-acl --exit-on-error`. Restart the API
   afterwards (`gcloud run services update … --update-env-vars` or a new revision) so it runs
   migrations against the restored schema.
3. **Pin secrets** in the other direction: read `BETTER_AUTH_SECRET` and `CONTENT_SYNC_TOKEN`
   from SSM (`/fixedstep-<stage>-api/<KEY>`, `aws ssm get-parameter --with-decryption`) into
   `gcp-<stage>` config.
4. **Write it up** as an "AWS → GCP" subsection next to the existing runbook. Alternatively,
   restructure the runbook into "export from <cloud>" and "import into <cloud>" blocks that
   combine in either direction.

## Acceptance criteria

- [ ] The README has copy-pasteable AWS → GCP steps covering secrets, dump, restore, DNS and CI.
- [ ] The export method keeps containers free of standing AWS credentials, or the exception is
      narrow and documented.
- [ ] Rehearsed end to end on staging: data, logins and content survive, and the old stack
      destroys cleanly.
