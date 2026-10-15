import { account, type Db, session, user, verification } from "@fixedstep/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { EmailMessage, EmailProvider } from "./email/provider";
import { resetPasswordMessage, verifyEmailMessage } from "./email/templates";
import type { Env } from "./env";

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
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type SessionUser = Auth["$Infer"]["Session"]["user"];
