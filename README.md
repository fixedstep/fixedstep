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

Requirements: Node 24, pnpm 10, Docker.

```sh
pnpm install
cp .env.example .env            # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:up                      # Postgres 17 in Docker
pnpm db:generate                # first time / after schema changes: create SQL migrations
pnpm db:migrate
pnpm content:sync               # validate + load content-sample into the DB
pnpm dev                        # API on :3000, web on http://localhost:5173
```

Checks: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm content:validate`.

No Node on the host? Run any of these through Docker with the repo's pinned toolchain:
`scripts/in-docker.sh pnpm test` (host networking, so it reaches the compose Postgres).

## Deploying

Everything is named `fixedstep-<stage>-<component>` (stacks: `Fixedstep-<Stage>-<Component>`),
tagged `App=fixedstep` and `Stage=<stage>`. Secrets live under `fixedstep/<stage>/…`.

One-time setup:

1. `pnpm cdk bootstrap aws://<account>/us-east-1`
2. Set `GITHUB` repo names in `infra/lib/config.ts`, then
   `pnpm cdk deploy Fixedstep-GithubOidc`
3. In GitHub, create `staging` (limited to `main`) and `production` (required reviewers,
   `v*` tags) environments, and set repository variable `AWS_ACCOUNT_ID`.
4. First deploy, then fill in `fixedstep/<stage>/api` in Secrets Manager (Polar, GitHub
   OAuth) and force a new ECS deployment.
5. Once the `fixedstep.dev` Route 53 zone exists, uncomment `domain` in `infra/lib/config.ts`.

After that: merging to `main` deploys **staging**, and pushing a `v*` tag deploys **prod**
(after approval). Content is published by the private content repo's own workflow (see
`docs/content-repo-deploy.example.yml`).

## License

[AGPL-3.0](LICENSE). Course content is proprietary and not part of this repository.
