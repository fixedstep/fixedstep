# Privacy policy and terms of service (first draft)

**Area:** `apps/web` (new pages, footer links, sign-up/checkout notice), `README.md`.
**Depends on:** nothing. Related: `analytics-live-check` (PostHog goes live on staging).
**Origin:** user request (2026-10-28). Deferred from task `analytics`, which added PostHog.
There is no privacy policy or terms yet, so this task writes the first draft, not just a
PostHog mention.

## Problem

The platform collects personal data and takes payments, but publishes no privacy policy or terms:

- **Accounts:** email, name, password hash (better-auth), or a GitHub profile via OAuth.
  Sessions use a cookie.
- **Guests:** an anonymous user is created on the first submit. Stale guests are deleted by
  `deleteStaleGuests`.
- **Learning data:** submissions (student code), lesson progress, XP, hint unlocks and course
  ratings.
- **Billing:** Polar is the checkout provider and merchant of record (check this). The app
  stores entitlements and billing events, not card data.
- **Email:** verification and password-reset emails sent through Postmark (SMTP).
- **Product analytics:** PostHog (US). Cookieless, in-memory id, opaque user id only, query
  strings stripped, IP discarding turned on in the project.
- **Hosting:** GCP or AWS (US region; AWS is pinned to us-east-2), Postgres.
- **Admins:** aggregated learning metrics through `/api/admin/metrics`.

## Suggested approach

1. **Draft both documents** as Markdown (or TSX content) in `apps/web`, written plainly, from the
   inventory above. Check each item against the code before writing it down.
   - **Privacy policy:** who we are and how to contact us; what we collect and why; the legal
     basis; processors (Polar, Postmark, PostHog, the cloud host, GitHub for OAuth); cookies
     (session cookie only; analytics is cookieless); retention (guests, accounts, PostHog's
     1-year retention); user rights and how to delete an account; international transfers;
     children; changes to the policy, with an effective date.
   - **Terms:** accounts; acceptable use, including the rules for student code run by the grader;
     subscriptions, renewal, cancellation and refunds (aligned with Polar's terms); course content
     IP and licence; user-submitted code; disclaimers and limitation of liability; termination;
     governing law; changes.
   - Mark every fact only the user can supply (legal entity name, contact address, jurisdiction,
     refund policy) as `TODO(user)`. Don't invent them.
2. **Pages:** `/privacy` and `/terms` routes in `apps/web/src/router.tsx`, linked from the footer
   or Layout. Add a one-line "By signing up you agree to the Terms and Privacy Policy" on sign-up
   and before checkout.
3. **README:** replace "The privacy policy and terms don't name PostHog yet" with a pointer to
   the new pages and a note to update them whenever a processor or data type changes.

## Open questions (designer: ask the user)

- The legal entity or individual operating Fixedstep, a contact email, and the governing-law
  jurisdiction.
- The refund policy, and whether Polar's merchant-of-record terms cover it.
- Whether account self-deletion exists. If not, document deletion on request by email, and
  maybe split self-deletion into its own task.
- Whether the user will have the draft legally reviewed before prod. This task produces a
  draft, not legal advice.

## Acceptance criteria

- [x] A first-draft privacy policy covering every data type and processor listed above, checked
      against the code, with user-only facts marked `TODO(user)` or filled in by the user.
      (Contact email, minimum age and PostHog IP discarding were filled in by the user. The
      operator, jurisdiction and Polar refund URL stay `TODO(user)` in
      `apps/web/src/legal/facts.ts`.)
- [x] A first-draft terms of service covering accounts, acceptable use, subscriptions and
      refunds, content IP, liability and governing law.
- [x] `/privacy` and `/terms` pages, linked site-wide and from sign-up and checkout, with an
      effective date.
- [x] The README's PostHog follow-up line is replaced with a pointer to the pages.

## Plan

### Open questions: resolved (user, 2026-11-03)

- **Operator, contact email, governing law:** not supplied. They're `TODO(user)` placeholders,
  all in one file (`apps/web/src/legal/facts.ts`). The docs themselves contain no `TODO`.
  (`admin@fixedstep.com` is already the prod `emailReplyTo` and forwards via Cloudflare Email
  Routing. It's the obvious candidate, but it isn't filled in until the user says so.)
- **Refunds:** Polar is the merchant of record. The terms point to Polar's refund terms; users can
  cancel any time and keep Pro until the end of the paid period. Code check: README l.33 says
  "Polar (merchant of record)". Checkout is created on Polar (`billing/polar.ts` `createCheckout`,
  sending only `external_customer_id` = user id and `customer_email`); cancelling goes through
  Polar's customer portal (`/billing/portal`, `ManageBillingButton`); the app never sees card data.
  `activeEntitlementSql` keeps `canceled`/`past_due` active until `current_period_end`, which
  confirms "keep access until the end of the paid period". `paused` means `revoked`, so access
  stops at once.
- **Account deletion:** there's no self-deletion (no better-auth `user.deleteUser` config, and no
  `deleteUser` call anywhere in `apps/`). The policy says deletion is on request by email. Split
  out as `account-self-deletion` (bucket 3, content below).
- **Legal review:** none. The draft is published as-is, so every factual claim below is
  checked against the code. User-only facts stay `TODO(user)`.

### Inventory check (what the task text gets wrong or leaves out)

1. **Hint unlocks aren't stored.** They come from the count of `failed`/`error` submissions
   (`lib/hints.ts`). How many hints were *revealed* is kept in browser localStorage
   (`fixedstep:hints-revealed:<lesson>`).
2. **"Session cookie only" is true for cookies, but the app also uses localStorage.** Keys are
   `fixedstep:draft:<lesson>` (code drafts), `fixedstep:hints-revealed:*`,
   `fixedstep:editor-theme`, `fixedstep:outline:*`. All of it is functional and stays in the
   browser. better-auth sets `better-auth.session_token` (`__Secure-` prefix on HTTPS), which
   lasts 7 days and is renewed with use (better-auth 1.7.7 default; `session.expiresIn` isn't
   set). It also sets short-lived cookies during sign-in/OAuth. `session_data`/`account_data`
   are only used if cookieCache is on, and it isn't.
3. **Sessions store IP address and user agent** (`session.ip_address`, `session.user_agent`),
   and rate limits key on `x-forwarded-for` in memory (`context.ts clientKey`, the anonymous
   sign-in rule in `auth.ts`). This isn't in the inventory.
4. **GitHub OAuth** stores the name, email and avatar URL (`user.image`), plus the OAuth access
   token, refresh token and scope in `account`. Default scopes are `read:user user:email`.
   Email/password accounts store a password hash in `account.password`. Email verification
   isn't required to sign in, but it is required for checkout (`routes/billing.ts`).
5. **Guest retention:** `deleteStaleGuests` deletes anonymous users more than 1 h old that have
   no unexpired session. It runs at boot and hourly (`server.ts`), and the delete cascades.
   With the 7-day session, a guest is deleted about 7 days after their last visit. A guest who
   signs up or in has their progress, XP and submissions moved to the account and the guest row
   deleted (`mergeGuestProgress`).
6. **Submissions** hold the student's code *or* quiz answers, plus the grader result and the
   content hash (`submissions`). Code is sent to the internal grader (QuickJS) and isn't stored
   there.
7. **`billing_events` keeps the raw Polar webhook payload** (customer email/name, subscription
   details) with **no FK to `user`**, so it survives the account delete cascade. Manual
   deletion has to purge it (README runbook below, and the self-deletion task).
8. **Hosting:** prod is `aws-prod`, us-east-2 (Ohio): ECS Fargate, API Gateway, RDS.
   `Pulumi.gcp-prod.yaml` is unconfigured; GCP would be us-east1. DB backups are kept 7 days on
   prod and 1 day on staging (`config.ts`). CloudWatch logs (ECS, API Gateway access) are kept
   14 days. The access log format has method, path and status, no IP. Hono's `logger()` logs
   method, path and status. `facts.ts` holds the host string, so a move to GCP is a one-line edit.
9. **Cloudflare** is missing from the inventory. It handles DNS for fixedstep.com, the
   apex-to-www redirect and Email Routing (inbound mail to `admin@`). List it as a provider.
10. **PostHog:** the client side is confirmed in `lib/analytics.ts`: memory persistence,
    autocapture/recording/heatmaps/etc. pinned off, `before_send` allowlist, URL query/hash
    stripped, identify by opaque user id only, guests anonymous. Off when no key is set.
    "IP discarding" is a project setting the README says to "apply once" (README l.259). The
    browser still sends its IP to PostHog with each request, so the policy says PostHog is
    configured to discard it, not that it never receives it. The user should confirm the
    toggle is on (see Risks). The 1-year retention is the free-plan limit (README l.227).
11. **Admin metrics** (`/api/admin/metrics`) are aggregate counts, computed live, guests
    included. No per-learner rows are returned. Separately, operators can query the DB directly
    (`scripts/ops-sql.sh`). The policy should say so plainly.
12. **Postmark:** confirmed (README l.141, SMTP only, one Postmark Server per stage). It
    receives the recipient address and the email body (verification/reset link).

### Scope

All four acceptance criteria. Nothing is deferred. Self-deletion is out of scope (new task).

### Changes (in order)

1. **`apps/web/src/legal/facts.ts`** (new): the one place for user-only and deploy facts.
   ```ts
   /** Facts only the operator can supply. Every TODO(user) in the legal pages comes from here. */
   export const LEGAL_FACTS = {
     operator: "TODO(user): legal name of the person or company operating Fixedstep",
     contactEmail: "TODO(user): contact email for privacy and support requests",
     jurisdiction: "TODO(user): governing-law jurisdiction",
     minimumAge: "TODO(user): minimum age (e.g. 13, or 16 in the EU)",
     polarTermsUrl: "TODO(user): link to Polar's buyer/refund terms",
     host: "Amazon Web Services (AWS), region us-east-2 (Ohio, USA)", // gcp would be us-east1
     effectiveDate: "<YYYY-MM-DD: the date the PR is opened; lead bumps it at merge>",
   } as const;
   export type LegalFactKey = keyof typeof LEGAL_FACTS;
   ```
2. **`apps/web/src/legal/legal.ts`** (new):
   `export function fillLegal(source: string, facts: Record<string, string>): string` replaces
   `{{key}}` tokens and throws `Error("unknown legal fact: <key>")` on an unknown key.
   `export const PRIVACY = fillLegal(privacyMd, LEGAL_FACTS)` and the same for `TERMS`, with
   `import privacyMd from "./privacy.md?raw"` (`?raw` is already used for `hero-demo.ts`).
3. **`apps/web/src/legal/privacy.md`** (new). Plain CommonMark: react-markdown has no GFM
   here, so no tables. It opens with `# Privacy policy` and then `Effective {{effectiveDate}}`.
   Sections, written from the verified inventory above:
   who we are ({{operator}}, {{contactEmail}}); what we collect and why (account: name, email,
   password hash, or GitHub name/email/avatar/OAuth tokens; session: cookie, IP, user agent;
   guests; learning data: code/quiz-answer submissions and results, completions, XP/streaks,
   ratings; billing: entitlement status/period end and Polar webhook records, no card data;
   email; analytics; server logs); legal basis (contract for the service and billing;
   legitimate interests for security, rate limiting, guest progress and cookieless analytics);
   providers (Polar as merchant of record, with its own privacy policy for checkout;
   Postmark; PostHog US; {{host}}; GitHub if you sign in with it; Cloudflare for DNS and our
   inbound email); cookies and local storage (item 2 above; PostHog sets none); retention
   (account data until deletion; guests about 7 days after the last visit; backups 7 days; logs
   14 days; PostHog 1 year; billing records until account deletion, and Polar keeps its own);
   your rights and deletion (email {{contactEmail}}, no in-app deletion yet; what's deleted,
   including billing records; Polar and PostHog data handled on the same request); international
   transfers (everything is processed in the USA); children (not for under {{minimumAge}});
   changes (the effective date gets bumped and significant changes are announced on the site);
   admins/operators (aggregate metrics, DB access for running the service).
4. **`apps/web/src/legal/terms.md`** (new). Opens with `# Terms of Service` and then
   `Effective {{effectiveDate}}`. Sections: who we are; accounts (accurate info,
   one person per account, keep the password safe, guests and how their progress expires);
   acceptable use (no attempts to escape the grader sandbox, extract hidden tests, solutions or
   quiz answers, scrape lessons, overload the service or mint guests in bulk; no malware or
   unlawful code); Pro subscriptions (bought through Polar as merchant of record, Polar's
   checkout terms apply; monthly/yearly prices as shown on the site; renews automatically
   until cancelled; cancel any time from "Manage billing" (Polar portal); access lasts until
   the end of the paid period; refunds per Polar's terms ({{polarTermsUrl}}); if a payment
   fails, Pro may end at the period end; a paused subscription loses Pro until resumed); course
   content (owned by {{operator}}, personal non-transferable licence, no redistribution of paid
   lessons; the platform code is open source under AGPL-3.0, linked to `GITHUB_URL`, and is
   separate from course content); your code (you keep ownership; you grant a licence to store,
   run, grade and show it back to you, and to use it in aggregate to improve lessons);
   availability, disclaimers and limitation of liability (as is, to the extent the law allows;
   liability capped at the amount paid in the last 12 months); suspension and termination;
   governing law ({{jurisdiction}}); changes; contact.
5. **`apps/web/src/pages/LegalPage.tsx`** (new):
   `export function LegalPage({ source }: { source: string })` renders
   `<article className="legal prose"><ReactMarkdown>{source}</ReactMarkdown></article>`.
   It uses plain `react-markdown`, not `components/Markdown` (that one splits playground blocks).
6. **`apps/web/src/router.tsx`:** add `/privacy` → `<LegalPage source={PRIVACY} />` and
   `/terms` → `<LegalPage source={TERMS} />`. `web.ts` already serves extension-less paths to
   the SPA, so no API change.
7. **`apps/web/src/components/LegalNotice.tsx`** (new):
   `export function AgreeNotice({ lead }: { lead: string })` renders
   `<p className="muted legal-notice">{lead}, you agree to the <Link to="/terms" target="_blank">Terms of Service</Link> and <Link to="/privacy" target="_blank">Privacy Policy</Link>.</p>`.
   The links open in a new tab, so form input isn't lost.
8. **`apps/web/src/pages/LoginPage.tsx`:** for `mode !== "forgot"`, render
   `<AgreeNotice lead="By creating an account or continuing with GitHub" />` under the form.
   It covers sign-in mode too, because a first-time GitHub sign-in there creates an account.
9. **Checkout notice:** in `HomePage.tsx` `Pricing` and `LessonPage.tsx` `Paywall`, put
   `<AgreeNotice lead="Payments are handled by Polar, our merchant of record. By upgrading" />`
   right under the upgrade button. Those are the only two `useUpgrade().start` call sites. The
   `?upgrade=` resume path after sign-up has already shown both notices.
10. **`apps/web/src/components/Layout.tsx`:** add footer links `<Link to="/privacy">Privacy</Link>`
    and `<Link to="/terms">Terms</Link>` after Pricing.
11. **`apps/web/src/styles.css`:** add `flex-wrap: wrap` to `.site-footer nav` (5 links at
    360 px). Add `.legal { max-width: 760px; margin: 40px auto; padding: 0 16px; overflow-wrap: break-word; }`
    and `.legal-notice { font-size: 13px; }`.
12. **`README.md`:** replace l.265 with: the privacy policy and terms are at `/privacy` and
    `/terms`; sources are in `apps/web/src/legal/` (operator facts in `facts.ts`); update them and
    bump `effectiveDate` whenever a processor, a stored data type, a cookie/localStorage key or a
    retention period changes. Add a short **"Account deletion requests"** runbook next to
    "Learning metrics": cancel the Polar subscription, then run
    `DELETE FROM "user" WHERE email = …` (it cascades) and
    `DELETE FROM billing_events WHERE payload->'data'->'customer'->>'external_id' = <id>` through
    `scripts/ops-sql.sh`, delete the PostHog person by user id, and reply to the requester.
13. **`tasks/todo/3_account-self-deletion.md`** (new; the user picks the bucket, 3 is proposed):
    ```md
    # Account self-deletion

    **Area:** `apps/api` (`auth.ts`, a delete hook), `apps/web` (an account/settings entry point),
    `apps/web/src/legal/privacy.md`, `README.md`.
    **Depends on:** `privacy-policy-and-terms` (merged), which documents deletion by email.
    **Origin:** user decision while planning `privacy-policy-and-terms` (2026-11-03).

    ## Problem

    Users can only delete their account by emailing us. Deletion should be self-serve.

    ## Suggested approach

    1. Enable better-auth `user.deleteUser` (fresh session or email confirmation). Guests are
       excluded; they expire on their own.
    2. In a `beforeDelete` hook: refuse, or cancel first, if an entitlement is active (Polar API
       via `BillingProvider`, a new `cancelSubscription`); purge `billing_events` rows for the user
       (no FK, so the cascade misses them).
    3. Web: a "Delete account" action with confirmation; on success, sign out and call
       `analytics.setUser(null)`.
    4. PostHog person deletion needs a personal API key server-side: decide whether to automate
       it or keep it a manual runbook step.
    5. Update the privacy policy's deletion section and the README runbook.

    ## Acceptance criteria

    - [ ] A signed-in, non-guest user can delete their account, with confirmation.
    - [ ] All user rows (cascade) and their `billing_events` are gone; any active subscription is
          cancelled first.
    - [ ] The privacy policy and README describe the new flow.
    - [ ] API tests cover the delete hook; e2e covers the flow.
    ```

No `@fixedstep/content-schema` DTO changes, no API changes, no `infra/` changes.

### Tests

- **`apps/web/src/legal/legal.test.ts`** (new, vitest `.ts` in the style of `rating.test.ts`;
  import the raw md with `?raw`):
  - `fillLegal` replaces each token, leaves other text alone, and throws on `{{nope}}`.
  - `PRIVACY`/`TERMS` contain no `{{`. They start with `# ` and contain
    `Effective ${LEGAL_FACTS.effectiveDate}`.
  - The raw `privacy.md`/`terms.md` contain no `TODO` (placeholders live only in `facts.ts`).
  - `PRIVACY` names each provider: Polar, Postmark, PostHog, GitHub, Cloudflare,
    `LEGAL_FACTS.host`. It mentions `local storage` and the session cookie.
  - `TERMS` mentions Polar, cancellation, `LEGAL_FACTS.jurisdiction`, `LEGAL_FACTS.polarTermsUrl`.
- **`e2e/specs/legal.spec.ts`** (new):
  - The footer Privacy/Terms links go to `/privacy` and `/terms`, each with an h1 and the
    "Effective" line, and direct loads of both URLs render.
  - `/login?mode=signUp` shows the notice, with links whose `href`s are `/terms` and `/privacy`.
  - A signed-in non-Pro user on the paid lesson sees the Polar notice under "Upgrade to Pro"
    (not clicked, as in `paywall.spec.ts`).
  - After `signUp(page.request)` and a lesson visit, every cookie matches
    `/^(__Secure-)?better-auth\./` and every localStorage key starts with `fixedstep:`. This
    guards the policy's cookie section.
- **`e2e/specs/phone-layout.spec.ts`:** add "the privacy and terms pages have no sideways page
  scroll" (`expectNoPageScrollX` on both).
- Checks: `node_modules/.bin/biome check .`, `node_modules/.bin/tsc -p apps/web --noEmit` and
  `-p e2e --noEmit`, `node_modules/.bin/vitest run --configLoader runner`, then
  `e2e/node_modules/.bin/playwright test --config e2e/playwright.config.ts`.

### Risks

- **CLAUDE.md invariants:** none touched. The change is web-only static text: no hidden
  tests, solutions or answers, no XP writes, no `harnessRuntime`, no cloud SDKs.
- **Accuracy is the main risk** (no legal review). The implementer must not add claims beyond
  the inventory above: no SCCs/DPAs, no Polar location, no Postmark retention period, no refund
  window. Where a fact is unknown, it gets a new `facts.ts` entry as `TODO(user)`.
- **Visible placeholders:** prod will show `TODO(user): …` text until the user fills
  `facts.ts`. That's intended, but call it out in the PR.
- **PostHog IP discard** is a manual project toggle. The policy states it as configured, so the
  user must confirm it's on before merge.
- **Drift:** the policy hard-codes retention figures (7-day session, 7-day backups, 14-day logs)
  and the host. The README note covers this. The unit test only checks that providers are named.
- **Optional, not in scope:** a sign-up notice for guests on their first submit (guests are
  covered by the site-wide footer links), and a real postal address or transfer mechanism (add
  `facts.ts` keys if the user wants them).
