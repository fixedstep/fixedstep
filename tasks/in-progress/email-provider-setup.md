# Send real email on staging and prod

**Area:** `apps/api/src/email/*`, `apps/api/src/auth.ts`, `apps/api/src/env.ts`,
`infra/src/app-spec.ts`, `infra/Pulumi.{gcp,aws}-{staging,prod}.yaml`, `README.md`
**Origin:** requested 2026-10-22. Every stage still runs `EMAIL_PROVIDER=log`, so verification
and password-reset emails only show up in the API logs.

## What already exists

- **App:** `EmailProvider` interface (`apps/api/src/email/provider.ts`), a nodemailer SMTP sender
  (`smtp.ts`), a console logger (`log.ts`), and two templates (`templates.ts`): verify email and
  reset password.
  - `auth.ts` sends both without awaiting them, so a mail outage doesn't fail sign-up and
    response timing doesn't reveal whether an account exists. Failures are logged as
    `[email] … failed to send`.
- **Env:** `EMAIL_PROVIDER` (`log` | `smtp`), `SMTP_URL` and `EMAIL_FROM`. Validation requires
  both of the last two when the provider is `smtp`.
- **Infra:** `SMTP_URL` is a provider secret in `infra/src/app-spec.ts`, and `apiSpec` switches
  to `EMAIL_PROVIDER=smtp` once both `SMTP_URL` and the `fixedstep:emailFrom` stack config are
  set. Otherwise it warns and keeps logging. This is shared by both clouds, so GCP and AWS stay
  in step.
- **DNS:** managed outside Pulumi. Stacks print the records to create (see the ACM validation in
  `infra/src/aws/ingress.ts`).

## Decision needed first

Choose the provider. To keep the app cloud-neutral (CLAUDE.md), it should be reached over SMTP
with credentials from stack config, not set up through a cloud SDK or provider-specific infra
in `infra/src/<cloud>/`. That way the same setup works whichever cloud runs a stage.

- **Third-party transactional provider** (Postmark, Resend, Mailgun, …): the same setup on
  either cloud. Most have a free or cheap tier that covers auth email volume.
- **Amazon SES used only as SMTP:** cheap, but new accounts start in the SES sandbox (only
  verified recipients) until production access is requested. Also, `us-east-2` is the only
  region the org's SCP allows, so check SES is available there.

Before choosing, compare price at expected volume, the deliverability reputation, whether each
stage gets its own key/project, and how the provider reports bounces and complaints.

## Suggested approach

1. **Provider setup, per stage:** a separate sending domain and credentials for each stage, so
   staging can't hurt prod's sender reputation.
   - staging sends from `noreply@staging.fixedstep.com`
   - prod sends from `noreply@fixedstep.com`

   Prefer a separate API key or SMTP user per stage too.
2. **DNS (manual, like the certificate records):** SPF, DKIM, a DMARC record (start at `p=none`
   with a reporting address) and the provider's return-path/bounce CNAME, for each sending
   domain. Document the exact records in `README.md` next to the existing email setup notes.
3. **Stack config:** for each active stack (`gcp-*` / `aws-*`):

   ```
   pnpm infra config set --secret -s <stack> SMTP_URL 'smtps://…'
   pnpm infra config set -s <stack> emailFrom "Fixedstep <noreply@…>"
   ```

   Also fix the commented `fixedstep:emailFrom` lines in `Pulumi.aws-staging.yaml` and
   `Pulumi.aws-prod.yaml`. They're indented under `aws:defaultTags.tags` and
   `aws:allowedAccountIds`, so uncommenting them as they stand would put the key in the wrong
   place. Move them to the top level of `config:`, as the GCP files already have them.
4. **Staging safety:** staging sends to real addresses (testers). Add a stage marker to staging
   emails, e.g. a `[staging]` subject prefix driven by an env var such as `EMAIL_SUBJECT_PREFIX`,
   so they're never mistaken for prod. Optionally add a recipient allowlist for staging.
5. **App hardening:**
   - Give the SMTP transport explicit connection/socket timeouts, so a hung provider doesn't
     tie up a connection for nodemailer's defaults.
   - Add `text`/`html` snapshot tests for the templates if they're missing.
   - Consider a `Reply-To` that reaches a real inbox.
6. **Test send:** add a small script (e.g. `pnpm --filter @fixedstep/api email:test <to>`) that
   sends one message through the configured provider. Setup can then be checked without signing
   up.
7. **Bounces/complaints (optional here):** at minimum, confirm where the provider shows them and
   note it in the README. Processing them automatically (webhook → suppress the address) can be a
   follow-up task.

## Acceptance criteria

- [ ] Provider chosen, with the reason and expected cost noted here.
      *Open:* Postmark chosen 2026-10-22 (reason in the Plan); the cost (staging free tier?,
      prod ~$15/mo) still needs verifying at sign-up (manual step 1).
- [ ] Sending domains verified (SPF, DKIM, DMARC pass) for `staging.fixedstep.com` and
      `fixedstep.com`, and the records documented in `README.md`.
      *Open:* records documented in README "Email setup (per stage)"; DNS creation and Postmark
      verification are manual (steps 2–3), then fill in the dashboard values.
- [ ] `SMTP_URL` and `emailFrom` set on the active staging and prod stacks. `pulumi up` prints no
      `SMTP_URL/emailFrom not set` warning (it's a Pulumi warning, not an API log line).
      *Open:* manual (steps 4–5).
- [ ] Sign-up verification and password reset emails arrive in an inbox (not spam) on both
      staging and prod. Staging emails are clearly marked as staging.
      *Open:* the `[staging]` subject prefix is in code (`app-spec.ts` + `withSubjectPrefix`);
      inbox checks are manual (step 6). The first real `email:test` run also confirms the
      script's CLI entry guard, which has no unit test.
- [x] No cloud SDK or cloud-specific email code in `apps/` or `infra/src/<cloud>/`. Both cloud
      targets get email from the same `app-spec.ts` path.
- [x] `Pulumi.aws-*.yaml` `emailFrom` placement fixed.
- [x] Unit tests cover any new app code (subject prefix, transport timeouts, test-send script).

## Plan

### Provider comparison

Pricing, free-tier limits and plan features below come from memory and could not be checked.
**Verify before signing up.** Volume assumed: hundreds to a few thousand messages a month per stage.

| | Postmark | Resend | Mailgun | Amazon SES (SMTP only, us-east-2) |
|---|---|---|---|---|
| Price at our volume (verify) | Free dev tier around 100/mo (staging may fit). Paid from about $15/mo for 10k, shared across all servers in the account. | Free tier around 3k/mo with a daily cap (about 100/day), and possibly only 1 domain. Pro about $20/mo. Two domains may push prod onto paid. | Free/trial tier is small (about 100/day). Basic about $15/mo. | About $0.10 per 1,000, so under $1/mo. No monthly fee. |
| Deliverability reputation | Best known for transactional mail. Transactional-only policy keeps its shared IPs clean. | Good and newer. Built on top of SES. | Solid, but shared pools are mixed (lots of bulk senders). | Good once out of the sandbox, but reputation is your own account's: AWS reviews at about 5% bounces or 0.1% complaints. |
| Per-stage separation | One "Server" per stage, each with its own SMTP token. Both domains verified in one account. | One API key per stage, which can be restricted to a sending domain. Separate teams if quota isolation matters. | One domain per stage, each with its own SMTP credentials. Subaccounts on higher plans. | Natural fit: staging and prod are already separate AWS accounts. Each needs its own sandbox exit, SMTP IAM user and verified identity. |
| Bounces / complaints | Activity UI per server. Hard bounces and spam complaints are auto-suppressed. Webhooks available. | Dashboard and webhooks. Auto-suppression. | Logs, a suppression list per domain, webhooks. | Account-level suppression list only. To see events you need SNS/configuration-set wiring, or VDM, which costs extra. Nothing in a dashboard by default. |
| SMTP | Yes: 587/2525/25 with STARTTLS (465 may not be offered, so verify). Username and password are both the server token. | Yes: `smtp.resend.com` 465/587. User `resend`, password is the API key. | Yes: 465/587, per-domain credentials. | Yes: `email-smtp.us-east-2.amazonaws.com` 465/587. Credentials come from an IAM user (derived SMTP password). Check SES is offered in us-east-2. |
| Other | | | US/EU region choice. | New accounts start in the sandbox and need a production-access request (about a day). Ties email to AWS even when a stage runs on GCP. Creating the SMTP IAM user by hand keeps it out of `infra/src/aws`. |

**Recommendation: Postmark.** Auth email lives or dies by inbox placement, and Postmark has the
strongest record for exactly this kind of mail. Per-stage Servers give separate tokens and
separate reputation tracking. Bounces and complaints are visible and suppressed with no extra
wiring, which covers step 7 with no code. Expected cost: staging may fit the free tier and prod
about $15/mo (**cost, verify**). If cost matters more than setup effort, SES is the fallback
(under $1/mo), but it means a sandbox exit per account and no bounce visibility without extra
AWS setup. The code below doesn't depend on the choice.

**Decision (2026-10-22): Postmark**, confirmed by the user. Docs target Postmark: one Server per
stage, SMTP on `smtp.postmarkapp.com:587` (STARTTLS), token as both user and password. The staging
recipient allowlist and the bounce/complaint webhook are out of scope (follow-ups).

### Scope

This branch (code, docs, config):
- AC "No cloud SDK or cloud-specific email code…": kept. Everything goes through `app-spec.ts`.
  Both `infra/src/gcp/service.ts` and `infra/src/aws/service.ts` already map `spec.env`
  generically, so **no `infra/src/<cloud>/` edits are needed**.
- AC "`Pulumi.aws-*.yaml` `emailFrom` placement fixed."
- AC "Unit tests cover any new app code."
- Part of AC 2 and 4: README DNS records (with provider placeholders until chosen) and the staging marker in code.

Deferred to the user's manual steps (these stay open after the PR): AC 1 (provider chosen and
cost noted), AC 2 (domains verified), AC 3 (stack config set and no warning after deploy), and
AC 4 (inbox delivery checked on both stages). Note on AC 3: `SMTP_URL/emailFrom not set` is a
**Pulumi** warning printed during `preview`/`up`, not an API log line. Check the `up` output.

### Changes (in order)

1. **`apps/api/src/env.ts`**
   - Pull the email keys into a shared `const emailFields = { EMAIL_PROVIDER, SMTP_URL, EMAIL_FROM, EMAIL_SUBJECT_PREFIX, EMAIL_REPLY_TO }`.
     The two new keys are `z.string().optional()`. Document the prefix as e.g. `[staging]`, set only on staging.
   - Spread `emailFields` into `Env`.
   - Add `export function loadEmailEnv(source = process.env): EmailEnv`. It validates only
     `emailFields`, with the same smtp-requires-URL+FROM rule and the same empty-string cleaning,
     so the test script runs without DB or auth vars. Share the refine as a small helper rather
     than copying it.
2. **`apps/api/src/email/smtp.ts`**
   - New signature:
     `createSmtpProvider(opts: { url: string; from: string; replyTo?: string; transport?: Pick<Transporter, "sendMail"> })`.
     `transport` is a test seam; the repo doesn't use `vi.mock`.
   - Add `export function smtpTransportOptions(url: string)`. It returns
     `{ url, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 }`.
   - Create the transport with `createTransport(smtpTransportOptions(opts.url))`.
   - Implementer: confirm in `node_modules/nodemailer/lib/smtp-transport/index.js` that the
     `url` option is parsed when it's passed inside an options object. If it isn't, merge the
     parsed URL with the timeouts.
   - `sendMail` adds `replyTo` only when it's set.
3. **`apps/api/src/email/provider.ts`**: add
   `export function withSubjectPrefix(provider: EmailProvider, prefix?: string): EmailProvider`.
   It returns `provider` unchanged if `prefix` is unset. Otherwise it sends `` `${prefix} ${subject}` ``
   and keeps `name`.
4. **New `apps/api/src/email/index.ts`**: add
   `export function createEmailProvider(env: EmailEnv): EmailProvider`. It picks smtp or log
   (moved out of `server.ts`) and wraps the result in `withSubjectPrefix(…, env.EMAIL_SUBJECT_PREFIX)`.
   **`apps/api/src/server.ts`** then uses `createEmailProvider(env)`.
5. **New `apps/api/src/email/send-test.ts`**: add
   `export async function sendTestEmail(to: string | undefined, env: EmailEnv, log = console): Promise<number>`,
   which returns an exit code.
   - Check `to` loosely (it must contain `@`). Otherwise print usage and return 2.
   - Build the provider with `createEmailProvider`. If it's `log`, warn that nothing will
     really be sent.
   - **Await** the send (unlike `auth.ts`). Subject: "Fixedstep test email". Text includes an
     ISO timestamp and `EMAIL_FROM`.
   - Return 0 on success, or log the error and return 1.
   - Add a CLI guard (`if (import.meta.url === pathToFileURL(process.argv[1]).href)`) that calls it with
     `process.argv[2]` and `loadEmailEnv()` and sets `process.exitCode`.
   - Keep it under `src/` so `tsc -p apps/api` typechecks it.
   - **Not** bundled into `dist`: `build.mjs` bundles only `server.ts`.
6. **`apps/api/package.json`**: add the script
   `"email:test": "tsx --env-file-if-exists=../../.env src/email/send-test.ts"`. tsx is already a
   root devDependency, and `dev` uses it. Usage: `pnpm --filter @fixedstep/api email:test you@example.com`,
   with `SMTP_URL`/`EMAIL_FROM` exported in the shell or set in `.env`.
7. **`infra/src/app-spec.ts`** (`apiSpec`), the shared path for GCP and AWS:
   - Add `...(config.stage === "staging" ? { EMAIL_SUBJECT_PREFIX: "[staging]" } : {})` to `env`.
     Set it regardless of `smtp`; it's harmless under `log`.
   - Optional (Reply-To): read `new pulumi.Config().get("emailReplyTo")` and pass it as
     `EMAIL_REPLY_TO` when it's set and `smtp` is true.
   - No secrets change: `SMTP_URL` is already in `PROVIDER_SECRETS`.
8. **`infra/Pulumi.aws-staging.yaml`, `infra/Pulumi.aws-prod.yaml`**: move the commented
   `# fixedstep:emailFrom: …` line out of `aws:defaultTags.tags` / `aws:allowedAccountIds` to
   2-space top level under `config:`. For example, put it just above `fixedstep:budgetAlertEmail`.
   Leave it commented: the user sets it with `config set`. Pulumi rewrites the file on
   `config set`, and the comment may drop then, which is fine. The GCP files need no change.
9. **`.env.example`**: add `EMAIL_SUBJECT_PREFIX=` and `EMAIL_REPLY_TO=` with one-line comments.
   Also mention `smtp://…:587` (STARTTLS) as well as `smtps://…:465`.
10. **`README.md`**: add an "Email setup (per stage)" subsection after *Provider credentials*:
    - One sending domain per stage: `staging.fixedstep.com` and `fixedstep.com`.
    - A DNS records table per domain, using `<provider>` placeholders: SPF TXT (`v=spf1 include:<provider-spf> ~all`
      on the return-path or sending domain, as the provider says), DKIM TXT/CNAME (`<selector>._domainkey`),
      return-path/bounce CNAME, and DMARC TXT `_dmarc.<domain>` → `v=DMARC1; p=none; rua=mailto:<reporting address>`.
      Note: one SPF record per name. If `fixedstep.com` already has one, merge the include.
    - `SMTP_URL` format (`smtp://user:pass@host:587` STARTTLS or `smtps://…:465`), URL-encoding
      the credentials, and the `config set` commands.
    - `email:test` usage.
    - Where bounces and complaints show up: Postmark's per-server Activity page, with hard
      bounces and spam complaints suppressed automatically.
    - That staging subjects get `[staging]`.

### Tests (vitest, flat `it(...)` style as in `templates.test.ts` / `env.test.ts`)

- **`apps/api/src/email/templates.test.ts`** (extend): `toMatchInlineSnapshot()` for
  `verifyEmailMessage(url)` and `resetPasswordMessage(url)`, covering `subject`, `text` and `html`.
  This is the first snapshot use in the repo; inline snapshots keep it reviewable. Move the
  existing env test into `env.test.ts`. Optional, but it belongs there.
- **`apps/api/src/env.test.ts`** (extend):
  - `EMAIL_SUBJECT_PREFIX`/`EMAIL_REPLY_TO` are optional, and an empty string means unset.
  - `loadEmailEnv` accepts `{EMAIL_PROVIDER:"smtp", SMTP_URL, EMAIL_FROM}` with no DB/auth vars.
  - `loadEmailEnv` rejects smtp without `EMAIL_FROM`.
- **New `apps/api/src/email/provider.test.ts`**:
  - `withSubjectPrefix` prefixes the subject and leaves `to`, `text`, `html` and `name` as they are.
  - An unset or empty prefix returns the same provider.
- **New `apps/api/src/email/smtp.test.ts`**:
  - `smtpTransportOptions` sets all three timeouts, each finite and at most 30 s, and keeps the URL.
  - With an injected fake transport, `send` passes `from`, sets `replyTo` only when configured,
    and an error from `sendMail` propagates as a rejection.
- **New `apps/api/src/email/send-test.test.ts`**: with a fake log sink and env `EMAIL_PROVIDER=log`:
  - A missing `to` returns 2.
  - A success returns 0, and the logged subject carries the prefix when one is set.
  - Failure path: return 1. Test it through a `createEmailProvider` seam: give `sendTestEmail`
    an optional `provider` parameter, defaulting to `createEmailProvider(env)`.
- `infra/` has no tests (vitest only includes `apps`/`packages`). The `app-spec.ts` change is
  covered by `tsc -p infra`.

Checks (from the repo root, per CLAUDE.md):
- `node_modules/.bin/biome check .`
- `node_modules/.bin/tsc -p apps/api --noEmit` and `node_modules/.bin/tsc -p infra --noEmit`,
  plus the other packages listed in CLAUDE.md
- `node_modules/.bin/vitest run --configLoader runner`

### Manual steps for the user (after the provider is confirmed; ACs 1–4 stay open until done)

1. Create the provider account (**cost: plan choice**) and record the provider, reason and
   monthly cost in this task file (AC 1).
2. Per stage, create a server/project/key or SMTP user. Add the sending domains
   `staging.fixedstep.com` and `fixedstep.com`. For SES: in each AWS account, in us-east-2,
   verify the identity, create an SMTP IAM user in the console, and request production access.
3. Create the SPF, DKIM, return-path and DMARC (`p=none`, with `rua`) records at the DNS provider.
   Wait for the provider to mark the domains verified, then fill the real values into the README
   placeholders (AC 2).
4. For each active stack:
   - `pnpm infra config set --secret -s <stack> SMTP_URL '…'`
   - `pnpm infra config set -s <stack> emailFrom "Fixedstep <noreply@…>"`
   - optionally `emailReplyTo`

   Commit the yaml changes through the lead.
5. Optionally run `email:test` locally against each stage's credentials. Then deploy
   (`pnpm infra up -s <stack>` or CI) and confirm there's no `SMTP_URL/emailFrom not set`
   warning (AC 3).
6. On staging and prod: sign up and request a password reset with a Gmail and an Outlook address.
   Check the mail lands in the inbox, SPF/DKIM/DMARC show `pass` in the headers, and staging
   subjects start with `[staging]` (AC 4).

### Risks

- **Invariants:** no hidden tests, solutions or answers are involved. No XP or progress writes.
  `harnessRuntime` is untouched. No cloud SDKs: nodemailer is plain SMTP, and the provider choice
  changes only docs and config.
- **Credentials:** `SMTP_URL` contains them. `send-test.ts` must never print the URL. Log only
  the host if anything. The log provider still prints links, as before.
- **Timeouts too low** could drop mail on a slow provider. Because sends are fire-and-forget,
  a timeout only shows up as an `[email] … failed to send` log. 10/10/20 s is generous for auth mail.
- **SPF on the apex** `fixedstep.com` could clash with an existing record or a future mail
  setup. Merge, don't add a second record.
- **Cost:** only the provider plan (manual step 1). No new cloud resources.
- **Optional, not in scope:** a staging recipient allowlist, and a bounce/complaint webhook
  with suppression (follow-up task).
