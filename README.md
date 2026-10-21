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
cloud-specific part is `infra/src/<cloud>/` (today: GCP, using Cloud Run, Cloud SQL and
Secret Manager), which maps the cloud-neutral spec in `infra/src/app-spec.ts` onto that
provider's services.

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
| `infra` | Pulumi (TypeScript): cloud-neutral app spec + per-cloud targets (GCP) |
| `content-sample` | A tiny sample course for local dev and CI |

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

Infrastructure is a Pulumi (TypeScript) program in `infra/`, with one stack per stage
(`staging`, `prod`). Each stage is its own GCP project, so staging can't touch prod. Resources
are named `fixedstep-<stage>-<component>`. The cloud-neutral parts (stage sizes, which services
exist, their env and secrets) are in `infra/src/{config,app-spec}.ts`; the GCP mapping is in
`infra/src/gcp/`. Moving to another cloud means adding `infra/src/<cloud>/` and setting
`fixedstep:cloud`; the app doesn't change.

Requirements: the [Pulumi CLI](https://www.pulumi.com/docs/install/), `gcloud`, and Docker
with buildx (images are built for linux/amd64).

One-time setup, per stage (`staging`, then `prod`), as a project owner:

1. Create the project with billing enabled, then
   `gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project <id>`.
2. State: `gcloud storage buckets create gs://<id>-pulumi-state --project <id> --location us-east1 --uniform-bucket-level-access`,
   then `cd infra && pulumi login gs://<id>-pulumi-state`. Stack secrets are encrypted with a
   passphrase (`PULUMI_CONFIG_PASSPHRASE`); keep it in your password manager.
3. `pnpm infra stack init <stage>` (first time), `pnpm infra config set gcp:project <id> -s <stage>`.
4. Provider credentials, each optional until needed:
   `pnpm infra config set --secret -s <stage> <NAME> <value>` for `GITHUB_CLIENT_ID`,
   `GITHUB_CLIENT_SECRET`, `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`,
   `POLAR_PRO_MONTHLY_PRODUCT_ID`, `POLAR_PRO_YEARLY_PRODUCT_ID` and `SMTP_URL`. For email, also set
   `pnpm infra config set -s <stage> emailFrom "Fixedstep <noreply@…>"`. Changing one later
   and running `up` rolls out a new revision.
5. `gcloud auth application-default login`, then `pnpm infra up -s <stage>`. This creates the
   GitHub Workload Identity trust CI uses from then on (`pnpm infra stack output github -s <stage>`).
   Grant that deployer service account `roles/storage.objectAdmin` on the state bucket.

Then in GitHub: create `staging` (limited to `main`) and `production` (required reviewers,
`v*` tags) environments. On each, set the variables `GCP_WORKLOAD_IDENTITY_PROVIDER` and
`GCP_DEPLOYER_SERVICE_ACCOUNT` (from the stack output) and `PULUMI_BACKEND_URL`
(`gs://<id>-pulumi-state`), plus the secret `PULUMI_CONFIG_PASSPHRASE`. Finally, set the
repository variable `DEPLOY_ENABLED=true`.

Custom domain: set `domain` in `infra/src/config.ts`, verify the domain for the project
(`gcloud domains verify <domain>`), deploy, then create the records from
`pnpm infra stack output dnsRecords -s <stage>` at your DNS provider.

After that: merging to `main` deploys **staging**, and pushing a `v*` tag deploys **prod**
(after approval). Content is published by the private content repo's own workflow (see
`packages/content-cli/template/_github/workflows/publish.yml`). It needs the stage's
`SITE_URL` and `CONTENT_SYNC_TOKEN` (`pnpm infra stack output contentSyncToken --show-secrets -s <stage>`).

## License

[AGPL-3.0](LICENSE). Course content is proprietary and not part of this repository.
