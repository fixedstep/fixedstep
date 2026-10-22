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
 * Logs omit the recipient address.
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
      console.error(`[email] ${email.name} failed to send "${message.subject}"`, e);
    },
  );
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
