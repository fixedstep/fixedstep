import { pathToFileURL } from "node:url";
import { type EmailEnv, loadEmailEnv } from "../env";
import { createEmailProvider } from "./index";
import type { EmailProvider } from "./provider";

/**
 * Sends one message through the configured provider, to check a stage's mail setup without
 * signing up: `pnpm --filter @fixedstep/api email:test you@example.com`. Never prints SMTP_URL
 * (it holds the credentials). Returns the process exit code.
 */
export async function sendTestEmail(
  to: string | undefined,
  env: EmailEnv,
  log: Pick<Console, "log" | "warn" | "error"> = console,
  provider: EmailProvider = createEmailProvider(env),
): Promise<number> {
  if (!to?.includes("@")) {
    log.error("usage: pnpm --filter @fixedstep/api email:test <to-address>");
    return 2;
  }
  if (provider.name === "log") {
    log.warn("EMAIL_PROVIDER=log: the message is printed below, not sent");
  }
  const sentAt = new Date().toISOString();
  const from = env.EMAIL_FROM ?? "(EMAIL_FROM unset)";
  try {
    await provider.send({
      to,
      subject: "Fixedstep test email",
      text: `Test email from Fixedstep, sent ${sentAt} from ${from}.\n`,
      html: `<p>Test email from Fixedstep, sent ${sentAt}.</p>`,
    });
  } catch (err) {
    log.error(`[email] test send to ${to} failed:`, err instanceof Error ? err.message : err);
    return 1;
  }
  log.log(`[email] test sent to ${to} via ${provider.name}`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await sendTestEmail(process.argv[2], loadEmailEnv());
}
