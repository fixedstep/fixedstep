# Privacy policy

Effective {{effectiveDate}}

This policy explains what personal data Fixedstep collects, why, who processes it and what you can do about it.

## Who we are

Fixedstep is operated by {{operator}}. For privacy questions and requests, email {{contactEmail}}.

## What we collect and why

**Accounts.** If you sign up with an email address and password, we store your name, your email address and a hash of your password. We never store the password itself. If you sign in with GitHub, we store your GitHub name, email address and avatar URL, plus the OAuth access and refresh tokens and the scopes you granted. We use these to run your account and let you sign in.

**Sessions.** Signing in sets a session cookie. We store each session with the IP address and user agent of the device that opened it. Our servers also count requests per IP address in memory to rate-limit abuse. Those counts aren't saved.

**Guests.** The first time you submit code or an answer without an account, we create a guest account for you, so you can keep your progress without signing up. A guest has the same learning data as an account, but no email address or password.

**Learning data.** The code and quiz answers you submit, the grading result, and a content hash of the lesson it was graded against. Also your completed lessons, XP, daily streak, hints unlocked (based on your failed attempts), and course ratings. We use this to run the lessons, grade your work and show your progress. The grader runs your code in a sandbox and doesn't store it.

**Billing.** Pro subscriptions are bought through Polar, which is our merchant of record. Polar collects your payment details. We never see or store card numbers. We store your subscription status and the end of your current paid period, along with the billing events Polar sends us. Those events include the customer name and email address and the subscription details.

**Email.** We send verification and password-reset emails through Postmark. Postmark receives your email address and the content of each message, including the link in it.

**Product analytics.** We use PostHog, hosted in the United States, to see how the site is used. PostHog runs without cookies and keeps its identifier in memory only. Signed-in users are identified by an opaque user ID, not by their email address or name. We don't record sessions and don't use autocapture or heatmaps. Web addresses are sent without their query strings or hashes. The events we send are page views, sign-up, email verification, course starts and completions, and checkout started and completed. We have set PostHog to discard IP addresses. Your browser still sends its IP address with each request, and PostHog discards it.

**Server logs.** Our servers log each request's method, path and status code. The access logs don't include IP addresses.

**Aggregate metrics and operators.** Course authors see aggregate learning metrics: counts of starts, completions, attempts, hint unlocks and ratings for each lesson and course. These are counts, not records about individual learners. Operators who run the service can also query the database directly to maintain it and to handle requests like yours.

## Legal basis

- **Contract:** we need your data to provide accounts, lessons, grading, progress and Pro subscriptions.
- **Legitimate interests:** keeping the service secure, rate-limiting and preventing abuse, keeping guest progress until you sign up, and cookieless product analytics to improve the lessons.

## Who processes your data

- **Polar** (checkout, subscriptions and billing; merchant of record). Polar's own privacy policy applies to checkout.
- **Postmark** (sends our account emails).
- **PostHog** (US; product analytics, as described above).
- **{{host}}** (hosting, servers and database).
- **GitHub** (only if you sign in with GitHub).
- **Cloudflare** (DNS for our domain, and forwarding of email sent to {{contactEmail}}).

## Cookies and local storage

- **Session cookie.** better-auth sets `better-auth.session_token` (named `__Secure-better-auth.session_token` on HTTPS) to keep you signed in. It lasts seven days and is renewed as you use the site. Short-lived cookies are also set while you sign in, including through GitHub.
- **Local storage.** Your browser keeps your code drafts for each lesson, the hints you have revealed, your editor theme and the lesson outline state. These stay in your browser and keep your work across visits. They aren't sent to us.
- **Analytics.** PostHog sets no cookies and no local storage.

## How long we keep data

- **Accounts:** until you delete your account, as described below.
- **Guests:** about seven days after their last visit, then deleted automatically along with their progress.
- **Database backups:** seven days.
- **Server logs:** 14 days.
- **Analytics (PostHog):** one year.
- **Billing records:** until you delete your account. Polar keeps the records it holds under its own terms.

## Your rights and deleting your data

You can ask us for a copy of the personal data we hold about you, ask us to correct it, or ask us to delete it. Email {{contactEmail}} from the address on your account. We don't yet have a button in the app to delete your account, so deletion happens on request by email.

When we delete your account, we remove your account details, progress, XP, submissions and ratings, and your billing records. If you have an active Pro subscription, we cancel it as part of the request. We also remove your PostHog profile. Polar keeps the records it holds under its own terms.

You also have the right to complain to a data protection authority.

## International transfers

Our servers and database are in the United States ({{host}}), and so is PostHog's cloud. If you use Fixedstep from outside the United States, your data is transferred to and processed in the United States. Some of our other providers may also process data outside the United States.

## Children

Fixedstep isn't for children under {{minimumAge}}. We don't knowingly collect personal data from anyone under that age. If you think a child under that age has given us personal data, email {{contactEmail}} and we'll delete it.

## Changes to this policy

We update this policy when our providers, the data we collect or the retention periods change. The effective date at the top shows the latest version. We announce significant changes on the site.
