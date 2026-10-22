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
    const message = err instanceof Error ? err.message : String(err);
    log.error(`[email] test send to ${to} failed:`, redact(message, env.SMTP_URL));
    return 1;
  }
  log.log(`[email] test sent to ${to} via ${provider.name}`);
  return 0;
}

/**
 * Hides credentials if a provider error echoes them: the whole connection URL, any URL's
 * `user:pass@`, and SMTP_URL's username and password on their own (raw and decoded).
 */
function redact(message: string, smtpUrl?: string) {
  let masked = smtpUrl ? message.replaceAll(smtpUrl, "<SMTP_URL>") : message;
  masked = masked.replace(/([a-z][a-z0-9+.-]*:\/\/)[^/\s@]*@/gi, "$1***@");
  // Longest first, so a secret that contains another is masked whole.
  const secrets = credentials(smtpUrl).sort((a, b) => b.length - a.length);
  for (const secret of secrets) masked = masked.replaceAll(secret, "***");
  return masked;
}

function credentials(smtpUrl?: string): string[] {
  if (!smtpUrl || !URL.canParse(smtpUrl)) return [];
  const { username, password } = new URL(smtpUrl);
  const raw = [username, password];
  return [...raw, ...raw.map(safeDecode)].filter((s) => s !== "");
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await sendTestEmail(process.argv[2], loadEmailEnv());
}
