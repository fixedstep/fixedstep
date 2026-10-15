/**
 * Email is behind this interface so the sender can be swapped (SES today; maybe Postmark or
 * Resend later). Callers build messages from `templates.ts`; providers only deliver them.
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
