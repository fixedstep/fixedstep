import type { SendMailOptions } from "nodemailer";
import type { EmailProvider } from "./provider";

/**
 * Explicit timeouts, so a hung provider fails the send within seconds instead of holding the
 * connection for nodemailer's defaults (2 min to connect, 10 min idle). nodemailer parses `url`
 * and merges it with the other options.
 */
export function smtpTransportOptions(url: string) {
  return { url, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 };
}

/**
 * Plain SMTP, which every transactional provider speaks (Postmark, SES, Resend, Mailgun...),
 * so switching providers is a config change. `from` must be on a domain the provider verified.
 * `transport` replaces the real connection in tests.
 */
export function createSmtpProvider(opts: {
  url: string;
  from: string;
  replyTo?: string;
  transport?: { sendMail(message: SendMailOptions): Promise<unknown> };
}): EmailProvider {
  let transport = opts.transport;
  return {
    name: "smtp",

    async send({ to, subject, text, html }) {
      if (!transport) {
        const { createTransport } = await import("nodemailer");
        transport = createTransport(smtpTransportOptions(opts.url));
      }
      await transport.sendMail({
        from: opts.from,
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
        to,
        subject,
        text,
        html,
      });
    },
  };
}
