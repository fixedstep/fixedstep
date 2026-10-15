import type { EmailProvider } from "./provider";

/**
 * Prints emails instead of sending them: local dev, and stages without a verified SES
 * identity yet. The text body includes the links, so use it only where logs are private.
 */
export function createLogProvider(): EmailProvider {
  return {
    name: "log",

    async send({ to, subject, text }) {
      console.log(`[email] to=${to} subject=${JSON.stringify(subject)}\n${text}`);
    },
  };
}
