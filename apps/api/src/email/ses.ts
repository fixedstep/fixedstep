import type { EmailProvider } from "./provider";

/**
 * Amazon SES (v2 API). Credentials and region come from the environment (the ECS task role
 * in AWS). `from` must be on an identity verified in SES; until the account leaves the SES
 * sandbox, recipients must be verified too.
 */
export function createSesProvider(opts: { from: string }): EmailProvider {
  let client: import("@aws-sdk/client-sesv2").SESv2Client | undefined;
  return {
    name: "ses",

    async send({ to, subject, text, html }) {
      const { SESv2Client, SendEmailCommand } = await import("@aws-sdk/client-sesv2");
      client ??= new SESv2Client({});
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: opts.from,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: "UTF-8" },
              Body: {
                Text: { Data: text, Charset: "UTF-8" },
                Html: { Data: html, Charset: "UTF-8" },
              },
            },
          },
        }),
      );
    },
  };
}
