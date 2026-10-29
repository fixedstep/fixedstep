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

- [ ] A first-draft privacy policy covering every data type and processor listed above, checked
      against the code, with user-only facts marked `TODO(user)` or filled in by the user.
- [ ] A first-draft terms of service covering accounts, acceptable use, subscriptions and
      refunds, content IP, liability and governing law.
- [ ] `/privacy` and `/terms` pages, linked site-wide and from sign-up and checkout, with an
      effective date.
- [ ] The README's PostHog follow-up line is replaced with a pointer to the pages.
