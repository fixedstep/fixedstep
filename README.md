# Fixedstep

Learn game development by building games — in the browser, one fixed step at a time.

Fixedstep is an interactive game-dev course platform: read a lesson, write TypeScript in the
browser, watch it run on a canvas, and get it verified by tests. This repository is the
**open-source platform** (AGPL-3.0). Course content lives in a separate private repository
and is delivered from the database.

## Architecture

```
                    ┌───────────────────────── AWS (us-east-1) ─────────────────────────┐
 browser ──HTTPS──▶ │ CloudFront ──/*──────▶ S3 (React SPA)                              │
                    │     │                                                              │
                    │     └──/api/*──(VPC origin)──▶ internal ALB ──▶ ECS Fargate (API)  │
                    │                                                  │      │          │
                    │                       RDS Postgres ◀─────────────┘      │ invoke   │
                    │                            ▲                            ▼          │
                    │   content bucket ──▶ sync Lambda (in VPC)     grader Lambda        │
                    │        ▲                                      (QuickJS/WASM,       │
                    └────────┼──────────────────────────────────────  no VPC, no IAM) ──┘
                 private content repo CI (validate → bundle → s3 put)
```

- **Lessons** are `reading`, `quiz`, `code` (functions + unit tests) or `sim` (a game that
  exports `init / update / render`, graded by simulated state, not pixels).
- **Grading is hybrid.** Visible tests run in a Web Worker for instant feedback. On submit,
  the server re-runs visible **and hidden** tests in QuickJS (WASM) on Lambda. XP and
  progress are only awarded after server verification.
- **Content protection.** Paid lesson bodies require an entitlement, and hidden tests,
  solutions, and quiz answers never leave the server. Lesson reads are rate limited.
- **Billing** goes through Polar (merchant of record) behind a `BillingProvider` interface.
  The app only ever reads its own `entitlements` table.
- **Email** (verification, password reset) goes behind an `EmailProvider` interface: Amazon
  SES in AWS (a domain identity with DKIM in the stage's hosted zone), or logged to the console
  in dev and on stages without a domain.

## Repository layout

| Path | What |
|---|---|
| `apps/web` | Vite + React SPA (TanStack Router/Query, CodeMirror, canvas preview worker) |
| `apps/api` | Hono API on Node (Better Auth, lessons, submissions, XP, billing webhooks) |
| `apps/grader` | Lambda handler: grades a submission in QuickJS |
| `packages/content-schema` | Zod schemas: content format + API DTOs (the contract with the content repo) |
| `packages/test-harness` | Test runtime shared by browser, grader and content CI |
| `packages/db` | Drizzle schema, client, migrations |
| `packages/content-cli` | `validate` / `sync` / `bundle` content; in-VPC sync Lambda |
| `infra` | AWS CDK (staging + prod in one account) |
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

To try the production API image (the one ECS runs) against the local database:
`docker compose --profile prod up --build api-prod` → http://localhost:3001.

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

Each stage is its own AWS account (in one AWS Organization), so staging can't touch prod.
Everything is named `fixedstep-<stage>-<component>` (stacks: `Fixedstep-<Stage>-<Component>`),
tagged `App=fixedstep` and `Stage=<stage>`. Secrets live under `fixedstep/<stage>/…`.

One-time setup, per stage (`staging`, then `prod`), with that account's credentials:

1. Set the stage's `account` in `infra/lib/config.ts` (CDK then refuses other credentials).
2. `pnpm cdk bootstrap aws://<account>/us-east-1`
3. `pnpm cdk deploy -c stage=<stage> --all` (the first deploy also creates the
   `Fixedstep-<Stage>-GithubOidc` roles CI uses from then on). Commit `infra/cdk.context.json`.
4. Fill in `fixedstep/<stage>/api` in Secrets Manager (Polar token, webhook secret and the monthly
   and yearly Pro product ids; GitHub OAuth) and force a new ECS deployment. Never edit that
   secret's template in `infra/lib/app-stack.ts` after it exists: CloudFormation would regenerate
   the secret and wipe the values.

Then in GitHub: create `staging` (limited to `main`) and `production` (required reviewers,
`v*` tags) environments, set an `AWS_ACCOUNT_ID` variable on each, and set the repository
variable `DEPLOY_ENABLED=true`. Once the domain's Route 53 hosted zone exists (in that stage's
account), uncomment `domain` in `infra/lib/config.ts`. The next deploy creates the SES
identity and DKIM records and switches that stage from logging emails to sending them. New
accounts start in the SES sandbox (verified recipients only), so request SES production access
for each stage's account before launch.

After that: merging to `main` deploys **staging**, and pushing a `v*` tag deploys **prod**
(after approval). Content is published by the private content repo's own workflow (see
`packages/content-cli/template/_github/workflows/publish.yml`).

## License

[AGPL-3.0](LICENSE). Course content is proprietary and not part of this repository.
