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

/** Marks every subject, e.g. `[staging]`, so staging mail is never mistaken for prod's. */
export function withSubjectPrefix(provider: EmailProvider, prefix?: string): EmailProvider {
  if (!prefix) return provider;
  return {
    name: provider.name,
    send: (message) => provider.send({ ...message, subject: `${prefix} ${message.subject}` }),
  };
}
