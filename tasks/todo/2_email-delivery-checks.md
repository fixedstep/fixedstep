# Check email delivery end to end on staging and prod

**Area:** `README.md` ("Email setup (per stage)"), the Postmark account, Cloudflare DNS
**Depends on:** nothing (`email-provider-setup` is complete).
**Origin:** split out of `email-provider-setup` (2026-10-27). Postmark is set up and approved,
and both AWS stacks send through it, but nobody has checked the authentication results or
delivery outside the user's own domain.

## Problem

Email works as far as the repo can tell: the stacks are configured, deploys run without the
`SMTP_URL/emailFrom not set` warning, and staging sign-up mail reaches own-domain addresses.
What's unverified is what real users see:

- The Postmark plan and monthly cost aren't recorded anywhere.
- SPF, DKIM and DMARC "should be passing", but no delivered message's headers have been checked.
- Password reset hasn't been tested on either stage, and prod sign-up hasn't been tested.
- Nothing has been sent to a Gmail or Outlook address, so inbox placement (vs. spam) is unknown.

Until these are checked, a broken DKIM record or a spam-folder placement would only show up as
users who can't verify their email or reset their password.

## Suggested approach

This is mostly manual checking; the only repo change is the README.

1. **Cost.** In Postmark, under the account's billing page, note the plan and its monthly
   price (and whether staging and prod share it, since the message quota is account-wide). Add
   a line to the README "Email setup (per stage)" section, e.g. "Plan: <name>, $<n>/mo
   (checked <date>)".
2. **SPF/DKIM/DMARC.** For each stage (sending domain `staging.fixedstep.com` and
   `fixedstep.com`):
   - Trigger a real email to a Gmail address: sign up, or run
     `pnpm --filter @fixedstep/api email:test <you>@gmail.com` with that stage's `SMTP_URL`
     and `EMAIL_FROM` (see the README).
   - Open the message in Gmail, open the ⋮ menu next to Reply and choose **Show original**.
   - The summary at the top must show **SPF: PASS**, **DKIM: PASS** and **DMARC: PASS**. DKIM
     should name the sending domain (`d=fixedstep.com` or `d=staging.fixedstep.com`), not
     only `pm.mtasv.net`.
   - If one fails, compare the DNS record in Cloudflare with the domain's **DNS Settings** page
     in Postmark (Sender Signatures), and check the `pm_bounces` CNAME is **DNS only**.
   - Optional: Postmark's free DMARC monitoring (dmarc.postmarkapp.com) to read the `rua`
     reports, and mail-tester.com (send to the address it shows, then read the score and its
     SPF/DKIM/DMARC section).
3. **Password reset and sign-up.** On staging and on prod, with a non-`fixedstep.com` address:
   - sign up and click the verification link;
   - request a password reset, follow the link and log in with the new password.

   Check the staging subjects start with `[staging]` and prod's don't. If a message doesn't
   arrive, look for it in the stage's Postmark Server **Activity** and in the API log
   (`[email] smtp sent` / `failed to send`, see the README).
4. **Inbox placement.** Repeat step 3's emails (or `email:test`) to a Gmail and an Outlook.com
   address. Each must land in the inbox, not Spam/Junk (and in Gmail, ideally Primary). If one
   lands in spam, check the authentication results first (step 2), then the content.
5. Optional, once all of the above pass consistently: move DMARC from `p=none` toward
   `p=quarantine` (README DMARC note). Ask the user first; it's a DNS change.

## Acceptance criteria

- [ ] The Postmark plan and monthly cost are recorded in the README "Email setup (per stage)"
      section, with the date checked.
- [ ] A delivered message from each sending domain (`staging.fixedstep.com`, `fixedstep.com`)
      shows SPF, DKIM and DMARC `PASS` in Gmail's "Show original", with DKIM aligned to the
      sending domain.
- [ ] Password reset works end to end on staging and prod, and prod sign-up verification
      arrives and its link works.
- [ ] Sign-up and password reset emails land in the inbox (not spam) at both Gmail and Outlook,
      on both stages. Staging subjects start with `[staging]`; prod's don't.
