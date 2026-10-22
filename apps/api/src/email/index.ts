import type { EmailEnv } from "../env";
import { createLogProvider } from "./log";
import { type EmailProvider, withSubjectPrefix } from "./provider";
import { createSmtpProvider } from "./smtp";

export function createEmailProvider(env: EmailEnv): EmailProvider {
  const provider =
    env.EMAIL_PROVIDER === "smtp"
      ? createSmtpProvider({
          url: env.SMTP_URL as string,
          from: env.EMAIL_FROM as string,
          replyTo: env.EMAIL_REPLY_TO,
        })
      : createLogProvider();
  return withSubjectPrefix(provider, env.EMAIL_SUBJECT_PREFIX);
}
