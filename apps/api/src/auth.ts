import { account, type Db, session, user, verification } from "@fixedstep/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import type { EmailMessage, EmailProvider } from "./email/provider";
import { resetPasswordMessage, verifyEmailMessage } from "./email/templates";
import type { Env } from "./env";
import { mergeGuestProgress } from "./lib/guests";

export function createAuth(env: Env, db: Db, email: EmailProvider) {
  // Not awaited: the response time would otherwise reveal whether an account exists, and a
  // mail outage shouldn't fail sign-up. Failures are logged; the user can ask again.
  const sendInBackground = (to: string, message: Omit<EmailMessage, "to">) => {
    email.send({ to, ...message }).catch((e) => {
      console.error(`[email] ${email.name} failed to send "${message.subject}"`, e);
    });
  };

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        sendInBackground(user.email, resetPasswordMessage(url));
      },
    },
    // Verification is sent but not required to sign in.
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        sendInBackground(user.email, verifyEmailMessage(url));
      },
    },
    socialProviders:
      env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
        ? { github: { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET } }
        : {},
    trustedOrigins: [env.WEB_ORIGIN],
    // Guests get an anonymous user on their first submit, so progress is graded and stored
    // like anyone else's. Signing up or in links it: progress moves over, then the guest is
    // deleted. Stale guests are swept by deleteStaleGuests.
    plugins: [
      anonymous({
        onLinkAccount: ({ anonymousUser, newUser }) =>
          mergeGuestProgress(db, anonymousUser.user.id, newUser.user.id),
      }),
    ],
    // Each guest is a user row; cap how fast one client can mint them (per IP, in-memory).
    rateLimit: { customRules: { "/sign-in/anonymous": { window: 3600, max: 10 } } },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionUser = Auth["$Infer"]["Session"]["user"];
