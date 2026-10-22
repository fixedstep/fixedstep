/**
 * Email is behind this interface so the sender can be swapped (SMTP covers most
 * providers). Callers build messages from `templates.ts`; providers only deliver them.
 */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface EmailProvider {
  readonly name: string;
  /** Resolves once the provider has accepted the message. Throws if it was rejected. */
  send(message: EmailMessage): Promise<void>;
}

/**
 * Not awaited: the response time would otherwise reveal whether an account exists, and a
 * mail outage shouldn't fail sign-up. Failures are logged; the user can ask again.
 * Logs omit the recipient address, and the subject they show is the template's, before any
 * `withSubjectPrefix`.
 */
export function sendInBackground(
  email: EmailProvider,
  to: string,
  message: Omit<EmailMessage, "to">,
): void {
  email.send({ to, ...message }).then(
    () => {
      console.log(`[email] ${email.name} sent "${message.subject}"`);
    },
    (e) => {
      console.error(
        `[email] ${email.name} failed to send "${message.subject}"`,
        describeSendError(e, to),
      );
    },
  );
}

/**
 * SMTP rejections (e.g. nodemailer's EENVELOPE) quote the recipient in their message and
 * carry it in `rejected`/`response`/`envelope`, so only `code`, `responseCode` and a
 * scrubbed message are kept.
 */
function describeSendError(e: unknown, to: string): string {
  const fields = typeof e === "object" && e !== null ? (e as Record<string, unknown>) : {};
  let text = e instanceof Error ? e.message : String(e);
  if (to) {
    const escaped = to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(escaped, "gi"), "<recipient>");
  }
  text = text.replace(/[^\s<>()"',;:@]+@[^\s<>()"',;:@]+/g, "<address>");
  const codes = (["code", "responseCode"] as const)
    .filter((k) => typeof fields[k] === "string" || typeof fields[k] === "number")
    .map((k) => `${k}=${fields[k]}`);
  return [...codes, text].join(" ");
}

/** Marks every subject, e.g. `[staging]`, so staging mail is never mistaken for prod's. */
export function withSubjectPrefix(provider: EmailProvider, prefix?: string): EmailProvider {
  const trimmed = prefix?.trim();
  if (!trimmed) return provider;
  return {
    name: provider.name,
    send: (message) => provider.send({ ...message, subject: `${trimmed} ${message.subject}` }),
  };
}
