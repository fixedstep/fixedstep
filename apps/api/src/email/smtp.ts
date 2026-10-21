import type { EmailProvider } from "./provider";

/**
 * Plain SMTP, which every transactional provider speaks (SES, Postmark, Resend, Mailgun...),
 * so switching providers is a config change. `from` must be on a domain the provider verified.
 */
export function createSmtpProvider(opts: { url: string; from: string }): EmailProvider {
  let transport: import("nodemailer").Transporter | undefined;
  return {
    name: "smtp",

    async send({ to, subject, text, html }) {
      const { createTransport } = await import("nodemailer");
      transport ??= createTransport(opts.url);
      await transport.sendMail({ from: opts.from, to, subject, text, html });
    },
  };
}
