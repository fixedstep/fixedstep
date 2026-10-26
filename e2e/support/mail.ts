import { readFileSync } from "node:fs";
import { API_LOG } from "./env";

/**
 * The link in the last password-reset email to `email`, from the API's `log` email provider
 * output, or null if none was sent yet. The provider prints each email with one console.log,
 * so parallel tests can't interleave inside an email.
 */
export function resetLinkFor(email: string): string | null {
  const log = readFileSync(API_LOG, "utf8");
  const header = `[email] to=${email} subject="Reset your Fixedstep password"`;
  const at = log.lastIndexOf(header);
  if (at === -1) return null;
  return /Choose a new password: (\S+)/.exec(log.slice(at + header.length))?.[1] ?? null;
}
