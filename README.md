# Fixedstep

Learn game development by building games — in the browser, one fixed step at a time.

Fixedstep is an interactive game-dev course platform: read a lesson, write TypeScript in the
browser, watch it run on a canvas, and get it verified by tests. This repository is the
**open-source platform** (AGPL-3.0). Course content lives in a separate private repository
and is delivered from the database.

## Architecture

```
 browser ──HTTPS──▶ API container ─────────────────▶ Postgres (private network only)
                    (Hono: /api/*, plus the built    │
                     React SPA for everything else)  └──HTTP + token──▶ grader container
                          ▲                                             (QuickJS/WASM, internal
                          │ POST /internal/content + token               only, no credentials)
 private content repo CI (validate → bundle → POST)
```

The app needs only containers, Postgres, SMTP and HTTPS, with no cloud SDKs in app code. The
cloud-specific part is `infra/src/<cloud>/`, which maps the cloud-neutral spec in
`infra/src/app-spec.ts` onto that provider's services: on GCP, Cloud Run, Cloud SQL and Secret
Manager; on AWS, ECS Fargate behind API Gateway, RDS/Aurora and SSM Parameter Store.

- **Lessons** are `reading`, `quiz`, `code` (functions + unit tests) or `sim` (a game that
  exports `init / update / render`, graded by simulated state, not pixels).
- **Grading is hybrid.** Visible tests run in a Web Worker for instant feedback. On submit,
  the server re-runs visible **and hidden** tests in QuickJS (WASM) in the isolated grader service. XP and
  progress are only awarded after server verification.
- **Content protection.** Paid lesson bodies require an entitlement, and hidden tests,
  solutions, and quiz answers never leave the server. Lesson reads are rate limited.
- **Billing** goes through Polar (merchant of record) behind a `BillingProvider` interface.
  The app only ever reads its own `entitlements` table.
- **Email** (verification, password reset) goes behind an `EmailProvider` interface: SMTP to
  any transactional provider (`SMTP_URL`), or logged to the console in dev and on stages without
  one configured.

## Repository layout

| Path | What |
|---|---|
| `apps/web` | Vite + React SPA (TanStack Router/Query, CodeMirror, canvas preview worker) |
| `apps/api` | Hono API on Node (Better Auth, lessons, submissions, XP, billing webhooks) |
| `apps/grader` | Grader service: `POST /grade` runs a submission in QuickJS |
| `packages/content-schema` | Zod schemas: content format + API DTOs (the contract with the content repo) |
| `packages/test-harness` | Test runtime shared by browser, grader and content CI |
| `packages/db` | Drizzle schema, client, migrations |
| `packages/content-cli` | `validate` / `sync` / `bundle` content |
| `infra` | Pulumi (TypeScript): cloud-neutral app spec + per-cloud targets (GCP, AWS) |
| `content-sample` | A tiny sample course for local dev and CI |
| `e2e` | Playwright end-to-end suite (critical journeys) |

## Local development

Requirements: Docker. (Node 24 + pnpm 10 on the host are optional.)

```sh
cp .env.example .env            # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up               # postgres + api (:3000) + web (http://localhost:5173), hot reload
scripts/in-docker.sh pnpm content:sync   # first run: load content-sample (API applies migrations itself)
```

`scripts/in-docker.sh <cmd>` runs any command in the dev container on the compose network,
e.g. `scripts/in-docker.sh pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm db:generate`.

To try the production images (API + SPA, and the grader, wired as deployed) against the local
database: `docker compose --profile prod up --build api-prod` → http://localhost:3001.

End-to-end tests (on the host, with its own database and ports 3100/5174): `pnpm db:up`, once
`pnpm --filter @fixedstep/e2e exec playwright install chromium`, then `pnpm e2e`.

### Writing course content

The `content:*` scripts load `CONTENT_DIR` from `.env` (relative to this repo; default
`content-sample`), and `docker compose` mounts that directory into the containers, so it can
be the private content repo checked out next to this one:

```sh
pnpm --filter @fixedstep/content-cli start init ../fixedstep-content   # once: new content repo
echo CONTENT_DIR=../fixedstep-content >> .env                          # then restart compose
scripts/in-docker.sh pnpm content:dev                       # re-sync on every save
scripts/in-docker.sh pnpm content:new <course>/<chapter>/<lesson> sim   # reading|quiz|code|sim
```

`init` writes the README, `.gitignore`, editor types and a publish workflow pinned to this
repo's current commit (`PLATFORM_REF`; push that commit first). `content:dev` syncs even when
a solution fails, so lessons can be previewed while being written; `content:validate` and CI
don't allow that.

Prefer running on the host? `pnpm install && pnpm db:up && pnpm db:migrate && pnpm content:sync && pnpm dev`
works too. Host and containers share one `node_modules` (and a repo-local `.pnpm-store/`), so you
can switch freely; just run `docker compose` from the repo root.

## Deploying

Infrastructure is a Pulumi (TypeScript) program in `infra/`. Stacks are named
`<cloud>-<stage>`: `gcp-staging`, `gcp-prod`, `aws-staging`, `aws-prod`. Each stage runs in its
own GCP project or AWS account, so staging can't touch prod, and each cloud keeps its stack
state in its own bucket. Normally only one cloud runs a given stage; the other's stack is
destroyed (or never created). Resources are named `fixedstep-<stage>-<component>`.

The cloud-neutral parts (stage sizes, which services exist, their env and secrets) are in
`infra/src/{config,app-spec}.ts`. Each cloud's mapping is in `infra/src/<cloud>/`, and the app
doesn't change between them:

| | GCP (`infra/src/gcp/`) | AWS (`infra/src/aws/`) |
|---|---|---|
| Containers | Cloud Run (scales to zero) | ECS Fargate (at least one task each; Spot on staging and for prod's grader) |
| Public HTTPS | Cloud Run URL / domain mapping | API Gateway HTTP API → VPC link (no load balancer) |
| API → grader | Internal-ingress Cloud Run URL | Cloud Map private DNS |
| Postgres | Cloud SQL (private IP) | staging: Aurora Serverless v2 (pauses when idle); prod: RDS |
| Secrets | Secret Manager | SSM Parameter Store (SecureString) |
| Egress | VPC + Cloud NAT | Public subnets, no NAT; security groups block all inbound |
| CI trust | Workload Identity Federation | IAM OIDC provider + deployer role |

On AWS, API Gateway limits requests to 30 s and 10 MB bodies.

Requirements: the [Pulumi CLI](https://www.pulumi.com/docs/install/), Docker with buildx
(images are built for linux/amd64), and `gcloud` or the `aws` CLI for the cloud you deploy to.

Each cloud's state lives in its own bucket, so point Pulumi at the right one before running
`pnpm infra …` for a stack: `pulumi login <bucket-url>`, or `export PULUMI_BACKEND_URL=<bucket-url>`
in that shell. Stack secrets are encrypted with a passphrase (`PULUMI_CONFIG_PASSPHRASE`); keep
it in your password manager.

**Provider credentials** (both clouds), each optional until needed:
`pnpm infra config set --secret -s <stack> <NAME> <value>` for `GITHUB_CLIENT_ID`,
`GITHUB_CLIENT_SECRET`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`,
`POLAR_PRO_MONTHLY_PRODUCT_ID`, `POLAR_PRO_YEARLY_PRODUCT_ID` and `SMTP_URL`. For email, also set
`pnpm infra config set -s <stack> emailFrom "Fixedstep <noreply@…>"`. Changing one later and
running `up` rolls out new containers. The generated secrets (`BETTER_AUTH_SECRET`,
`GRADER_TOKEN`, `CONTENT_SYNC_TOKEN`, `DB_PASSWORD`) can be pinned the same way. A migration
does that, so logins and the content repo's token survive it (see below).

### Email setup (per stage)

Email goes through [Postmark](https://postmarkapp.com) over plain SMTP, so it works the same
whichever cloud runs a stage. Until `SMTP_URL` and `emailFrom` are both set on a stack, `up` warns
`SMTP_URL/emailFrom not set` and the API only logs emails.

Each stage has its own sending domain and its own Postmark **Server** (one account), so staging
can't hurt prod's sender reputation and each has its own token:

| Stage | Postmark Server | Sending domain | `emailFrom` |
|---|---|---|---|
| staging | `fixedstep-staging` | `staging.fixedstep.com` | `Fixedstep <noreply@staging.fixedstep.com>` |
| prod | `fixedstep-prod` | `fixedstep.com` | `Fixedstep <noreply@fixedstep.com>` |

Postmark won't accept a free-mail address (Gmail, Proton…) at sign-up, so the account uses
`admin@fixedstep.com`. The domain's DNS is on Cloudflare, and **Email Routing** (free) forwards
`admin@` and `dmarc@fixedstep.com` to the team inbox. Enabling it adds Cloudflare's MX records
and an SPF record on `fixedstep.com`. Mail to any other address on the domain is dropped.

Add both domains at the account level under **Sender Signatures** (not inside a Server) as
domains, not single-address signatures, so every address on them can send. Each domain's **DNS
Settings** page lists its exact records; create them in Cloudflare (`<domain>` is
`staging.fixedstep.com` or `fixedstep.com`):

| Purpose | Type | Name | Value |
|---|---|---|---|
| DKIM | TXT | `<selector>._domainkey.<domain>` | `k=rsa; p=…`. Copy the name and value from the domain's DNS Settings. |
| Return-Path (bounces; SPF passes here) | CNAME | `pm_bounces.<domain>` (Postmark's default) | `pm.mtasv.net`, **DNS only** (grey cloud) |
| DMARC | TXT | `_dmarc.<domain>` | `v=DMARC1; p=none; rua=mailto:dmarc@fixedstep.com` |

Cloudflare proxies new CNAMEs by default, and Postmark can't verify a proxied Return-Path. DMARC
isn't a Postmark record. Staging gets its own so prod's policy can tighten separately.

Postmark reviews new accounts by hand; request approval from the account (Account Owner only).
Until then it accepts every message over SMTP but only delivers to the From address's own
domain, so staging (`noreply@staging.fixedstep.com`) can't reach `admin@fixedstep.com`. To test
staging before approval, add `staging.fixedstep.com` as a subdomain in Email Routing's settings
(it adds that subdomain's MX and SPF records) with a rule such as `test@staging.fixedstep.com` →
the team inbox, and sign up with that address. `test@blackhole.postmarkapp.com` also shows in
Activity but is dropped.

- **SPF:** with the custom Return-Path, SPF is checked on `pm_bounces.<domain>`, which Postmark
  covers, so the sending domain itself needs no SPF change. The only SPF record on
  `fixedstep.com` is Cloudflare Email Routing's. A name can have only one SPF record: if a
  domain ever needs another include, merge it into the existing `v=spf1 …` record.
- **DMARC:** start at `p=none` and read the reports. Once SPF and DKIM pass consistently, move to
  `p=quarantine`.
- Wait for Postmark to show DKIM and Return-Path as verified before setting the stack config.

Stack config, for each active stack. Use the stage's **Server** API token (Servers → the stage's
Server → API Tokens; the Account token can't send) as both the SMTP username and password, on
port 587 with STARTTLS (Postmark has no 465). Run these in a terminal of your own: leaving the
value off `SMTP_URL` makes Pulumi prompt for it, which keeps the token out of shell history.
Commit the changed `Pulumi.<stack>.yaml` (the URL is stored encrypted). CI deploys from `main`'s
yaml, so config that only exists locally is lost on the next deploy.

```
pnpm infra config set --secret -s <stack> SMTP_URL   # prompts; paste the URL below
pnpm infra config set -s <stack> emailFrom "Fixedstep <noreply@<domain>>"
pnpm infra config set -s <stack> emailReplyTo "<inbox someone reads>"   # optional
```

For Postmark, `SMTP_URL` is `smtp://<token>:<token>@smtp.postmarkapp.com:587` (STARTTLS), with
the real token in both places. Other providers may use `smtps://user:pass@host:465` (TLS).
URL-encode the username and password if they contain `@`, `:`, `/` or `%`. Staging subjects are
prefixed with `[staging]` (`EMAIL_SUBJECT_PREFIX`, set by `infra/src/app-spec.ts`).

To check a setup without signing up, export the stage's `SMTP_URL` and `EMAIL_FROM` (with
`EMAIL_PROVIDER=smtp`) in a shell, or put them in `.env`, and run
`pnpm --filter @fixedstep/api email:test you@example.com`. It sends one message and exits non-zero
if the provider rejects it.

On a deployed stage, the API logs `[email] smtp sent "<subject>"` when the provider accepts a
message and `[email] smtp failed to send …` when it doesn't (on AWS:
`aws logs tail /ecs/fixedstep-<stage>-api --region us-east-2 | grep '\[email\]'`). "Sent" means
Postmark accepted it; whether it was delivered is in the Server's Activity. The logged subject
is the template's, without the `[staging]` prefix that Activity and the inbox show, and logs
never include the recipient address.

Bounces and spam complaints show up in each Server's **Activity** page (Default Transactional
Stream). Postmark suppresses hard-bounced and complaining addresses automatically; they're listed
under the stream's **Suppressions**.

### Analytics (PostHog)

Product analytics (page views, sign-up and checkout funnels, retention) go to one
[PostHog](https://posthog.com) cloud project in the US region, shared by staging and prod. Every
event carries a `stage` property (`staging` / `prod`) and PostHog filters tell them apart. The
free plan covers 1 project, 1M events a month and 1 year of retention; events over the limit are
dropped, not billed (checked 2026-10-28; see [posthog.com/pricing](https://posthog.com/pricing)
for current limits and paid rates).

It is off unless a key is set, so local development, e2e and CI send nothing. Set the project's
public key (not a secret: it's visible in the browser) on both stage stacks:

```sh
pnpm infra config set -s <cloud>-<stage> posthogKey phc_…
pnpm infra config set -s <cloud>-<stage> posthogHost https://us.i.posthog.com   # optional (default)
```

The API hands the key, host and stage to the SPA at runtime through `GET /api/config`, so one
image serves every stage. Cookies and local storage are off (in-memory PostHog id), so no
consent banner is needed; autocapture and session recording are off; URLs are sent without query
strings or hashes; signed-in users are identified by their opaque user id only (no email or
name). Guests are tracked anonymously. Events: `$pageview`, `sign_up`, `email_verified`,
`course_started` (first completed lesson in a course), `lesson_completed`, `checkout_started`
and `checkout_completed` (only once the account is confirmed Pro).

Don't rely on PostHog project toggles (web vitals, heatmaps, dead clicks, exception capture,
surveys, session replay): the client pins those features off and drops every event except the
ones above, so switching them on in the project does nothing.

Known, accepted gap: a Pro user revisiting `/?checkout=success` (bookmark, back button) fires
`checkout_completed` again; the param is stripped after the first fire, so a reload doesn't.

Known, accepted gap: a full-page redirect (GitHub login, Polar checkout, the verify-email link)
starts a new anonymous id, so funnels through those steps join only from the identified side.

PostHog project settings to apply once:

- Turn on discarding client IP data.
- Set the internal/test account filter to `stage != prod`, so the default "filter out internal
  and test users" on new insights shows prod only. For staging, add the filter `stage = staging`
  and turn the test-account toggle off. Keep the test-account filter on for funnel and retention
  insights.

The privacy policy and terms don't name PostHog yet (a follow-up task).

### Learning metrics (admins)

Authors see per-lesson and per-course numbers (starts, completions, median attempts to pass,
hint unlocks, drop-off between lessons, completion rate, ratings) at `GET /api/admin/metrics`
and `GET /api/admin/metrics/<course-slug>`. Open the URL in a browser while signed in. Only
verified, non-guest accounts with `role = 'admin'` get an answer (401 signed out, 403 otherwise).
The responses are counts only: never lesson tests, solutions, quiz answers or hint texts.

The role lives only in the database (`user.role`, default `user`); the app has no way to set it.
Grant or revoke it with SQL, expecting `UPDATE 1`:

```sql
UPDATE "user" SET role = 'admin' WHERE email = '<email>' AND email_verified AND NOT coalesce(is_anonymous, false);
UPDATE "user" SET role = 'user' WHERE email = '<email>';   -- revoke
```

Run it with `psql` against the compose database locally (`docker compose exec postgres psql -U
fixedstep -c '…'`). On AWS, use the stack's ops task like the restore step in "Moving between
clouds", with `command: ["sh", "-c", "psql \"$DATABASE_URL\" -c '…'"]`. On GCP, connect through
the Cloud SQL Auth Proxy as in the dump step there. The check reads the role on every request, so
changes apply at once.

### GCP setup (per stage, as a project owner)

1. Create the project with billing enabled, then
   `gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project <id>`.
2. State: `gcloud storage buckets create gs://<id>-pulumi-state --project <id> --location us-east1 --uniform-bucket-level-access`,
   then `cd infra && pulumi login gs://<id>-pulumi-state`.
3. `pnpm infra stack init gcp-<stage>` (first time), `pnpm infra config set gcp:project <id> -s gcp-<stage>`.
4. Provider credentials (above).
5. `gcloud auth application-default login`, then `pnpm infra up -s gcp-<stage>`. This creates the
   GitHub Workload Identity trust CI uses from then on (`pnpm infra stack output github -s gcp-<stage>`).
   Grant that deployer service account `roles/storage.objectAdmin` on the state bucket.

Custom domain: set `domain` in `infra/src/config.ts`, verify the domain for the project
(`gcloud domains verify <domain>`), deploy, then create the records from
`pnpm infra stack output dnsRecords -s gcp-<stage>` at your DNS provider.

### AWS setup (per stage, as an account admin)

Everything runs in **us-east-2**. The organization's region SCP allows workloads only there; in
us-east-1 it allows just global services (IAM, billing, Route 53…).

1. Use a dedicated account per stage, created in the organization (AWS Organizations → Add an
   AWS account). Sign in to it from the management account's console with **Switch role**
   (`OrganizationAccountAccessRole`), then run `aws login --profile fixedstep-<stage> --region us-east-2`
   while that session is active, and `export AWS_PROFILE=fixedstep-<stage>`.
2. State: `aws s3 mb s3://<account-id>-fixedstep-pulumi-state --region us-east-2`, then
   `aws s3api put-bucket-versioning --bucket <account-id>-fixedstep-pulumi-state --versioning-configuration Status=Enabled`
   and `cd infra && pulumi login s3://<account-id>-fixedstep-pulumi-state`.
3. `pnpm infra stack init aws-<stage>` (first time), then pin the account so the stack can never
   touch another one: `pnpm infra config set --path 'aws:allowedAccountIds[0]' <account-id> -s aws-<stage>`.
4. Provider credentials (above), and `pnpm infra config set -s aws-<stage> budgetAlertEmail <address>`
   for a monthly cost alert (the limit per stage is `budgetUsd` in `infra/src/aws/index.ts`). For
   staging, also pin `CONTENT_SYNC_TOKEN`
   (`pnpm infra config set --secret -s aws-staging CONTENT_SYNC_TOKEN "$(openssl rand -hex 24)"`)
   so destroying and recreating staging doesn't change the content repo's token.
5. `pnpm infra up -s aws-<stage>`. This creates the GitHub OIDC trust and deployer role CI uses
   from then on (`pnpm infra stack output github -s aws-<stage>`). The role can administer the
   account, which includes the state bucket. If the account already has a GitHub OIDC provider,
   import it first (see `infra/src/aws/ci.ts`).

Custom domain: set `domain` in `infra/src/config.ts` and run `up`. It prints a certificate
validation record (`certificate validation: create CNAME …`) and waits until that record exists
at your DNS provider and the certificate is issued. Then create the remaining record from
`pnpm infra stack output dnsRecords -s aws-<stage>`. An apex domain needs an ALIAS/ANAME record,
not a CNAME.

Staging on AWS is meant to be torn down when unused: `pnpm infra destroy -s aws-staging` stops
all charges. Running `pnpm infra up -s aws-staging` brings it back (about 10–15 minutes); then
re-run the content repo's publish workflow, because the database starts empty.

### CI

In GitHub, create `staging` (limited to `main`) and `production` (required reviewers, `v*` tags)
environments. On each, set the variable `CLOUD` (`gcp` or `aws`), `PULUMI_BACKEND_URL` (that
cloud's state bucket) and the secret `PULUMI_CONFIG_PASSPHRASE`, plus the stack's `github`
output: `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOYER_SERVICE_ACCOUNT`, or
`AWS_DEPLOY_ROLE_ARN` and `AWS_REGION`. Finally, set the repository variable `DEPLOY_ENABLED=true`.

After that: merging to `main` deploys **staging**, and pushing a `v*` tag deploys **prod**
(after approval), each to the cloud its environment names. Content is published by the private
content repo's own workflow (see `packages/content-cli/template/_github/workflows/publish.yml`).
It needs the stage's `SITE_URL` and `CONTENT_SYNC_TOKEN`
(`pnpm infra stack output contentSyncToken --show-secrets -s <stack>`).

### Moving between clouds

A migration brings the new cloud up beside the old one, copies the database during a short
write freeze, moves DNS, and only then destroys the old stack. These steps are for GCP → AWS;
the reverse uses the same plan.

**1. Prepare (no downtime).**

1. Do the AWS setup above through step 3.
2. Copy the provider credentials: list them with
   `pnpm infra config -s gcp-<stage> --show-secrets` (GCP backend) and set each on `aws-<stage>`
   (AWS backend). Include `posthogKey` and `posthogHost`. The `user.role` column (admins) moves
   with the database dump.
3. Pin the generated secrets that must not change. `BETTER_AUTH_SECRET` keeps everyone logged in,
   and `CONTENT_SYNC_TOKEN` keeps the content repo's secret valid:

   ```sh
   for KEY in BETTER_AUTH_SECRET CONTENT_SYNC_TOKEN; do
     gcloud secrets versions access latest --project <gcp-id> \
       --secret "fixedstep-<stage>-api-$(echo "$KEY" | tr 'A-Z_' 'a-z-')" \
       | pnpm infra config set --secret -s aws-<stage> "$KEY"
   done
   ```

4. If a domain is set, lower its DNS TTL to 60 s a day ahead.
5. `pnpm infra up -s aws-<stage>`. With a domain, add the printed certificate validation
   record. It doesn't affect live traffic.
6. Smoke test the new stack at `pnpm infra stack output apiUrl -s aws-<stage>`.

**2. Cut over (a few minutes of downtime for a small database).**

1. Stop writes on GCP by closing the API to the internet:
   `gcloud run services update fixedstep-<stage>-api --project <gcp-id> --region us-east1 --ingress internal`.
2. Dump the GCP database. Cloud SQL has only a private IP, so add a public one temporarily
   for the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/sql-proxy). The proxy
   authenticates with IAM, so no authorized networks are opened. You need `pg_dump` 17.

   ```sh
   gcloud sql instances patch fixedstep-<stage>-db --project <gcp-id> --assign-ip
   cloud-sql-proxy --port 15432 <gcp-id>:us-east1:fixedstep-<stage>-db &
   SRC=$(gcloud secrets versions access latest --project <gcp-id> --secret fixedstep-<stage>-api-database-url \
     | sed -E 's#@[^/]+/#@127.0.0.1:15432/#; s#sslmode=require#sslmode=disable#')
   pg_dump -Fc --no-owner --no-acl "$SRC" > fixedstep.dump
   ```

3. Restore into AWS with the stack's one-off ops task (a Postgres client on the API's network).
   It wipes the new database's empty schema, then restores the dump:

   ```sh
   BUCKET=<account-id>-fixedstep-pulumi-state
   aws s3 cp fixedstep.dump "s3://$BUCKET/migration/fixedstep.dump"
   DUMP_URL=$(aws s3 presign "s3://$BUCKET/migration/fixedstep.dump" --expires-in 3600)
   OPS=$(cd infra && pulumi stack output ops -s aws-<stage> --json)
   RESTORE='psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA public CASCADE; CREATE SCHEMA public;" && wget -qO- "$DUMP_URL" | pg_restore --no-owner --no-acl --exit-on-error -d "$DATABASE_URL"'
   aws ecs run-task --launch-type FARGATE \
     --cluster "$(jq -r .cluster <<<"$OPS")" \
     --task-definition "$(jq -r .taskDefinition <<<"$OPS")" \
     --network-configuration "$(jq -r .networkConfiguration <<<"$OPS")" \
     --overrides "$(jq -n --arg url "$DUMP_URL" --arg cmd "$RESTORE" \
       '{containerOverrides: [{name: "ops", command: ["sh", "-c", $cmd], environment: [{name: "DUMP_URL", value: $url}]}]}')"
   aws logs tail "$(jq -r .logGroup <<<"$OPS")" --follow   # Ctrl-C once the task stops
   aws ecs update-service --cluster "$(jq -r .cluster <<<"$OPS")" --service fixedstep-<stage>-api --force-new-deployment
   aws s3 rm "s3://$BUCKET/migration/fixedstep.dump"
   ```

   Course content lives in the database, so it comes along and doesn't need republishing.
4. Move DNS: replace the GCP records with those from
   `pnpm infra stack output dnsRecords -s aws-<stage>`.
5. If the site URL changed (no custom domain), update the GitHub OAuth app's callback URL, the
   Polar webhook URL and the content repo's `SITE_URL`.
6. Point CI at AWS: on the GitHub environment, set `CLOUD=aws`, `AWS_DEPLOY_ROLE_ARN`,
   `AWS_REGION`, `PULUMI_BACKEND_URL` and, if it differs, `PULUMI_CONFIG_PASSPHRASE`.

**3. Clean up.** Leave the GCP stack in place (closed to the internet) for a day or two as a
rollback: re-open its ingress and move DNS back. Writes made on AWS in the meantime would be
lost. Then destroy it with `pnpm infra destroy -s gcp-<stage>` (GCP backend). On prod, data
protection blocks that until you lift it on purpose: run
`gcloud sql instances patch fixedstep-prod-db --project <gcp-id> --no-deletion-protection`
and `pnpm infra state unprotect --all -s gcp-prod` first. `fixedstep.dump` holds user data:
keep it encrypted somewhere safe until you're sure, then delete it.

## License

[AGPL-3.0](LICENSE). Course content is proprietary and not part of this repository.
