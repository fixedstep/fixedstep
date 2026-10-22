import { expect, it } from "vitest";
import { type EmailMessage, type EmailProvider, withSubjectPrefix } from "./provider";

function recorder() {
  const sent: EmailMessage[] = [];
  const provider: EmailProvider = {
    name: "fake",
    async send(m) {
      sent.push(m);
    },
  };
  return { provider, sent };
}

const message = { to: "a@b.c", subject: "Hello", text: "t", html: "<p>h</p>" };

it("prefixes the subject and leaves the rest of the message alone", async () => {
  const { provider, sent } = recorder();
  const prefixed = withSubjectPrefix(provider, "[staging]");
  expect(prefixed.name).toBe("fake");
  await prefixed.send(message);
  expect(sent).toEqual([{ ...message, subject: "[staging] Hello" }]);
});

it("returns the same provider without a prefix", () => {
  const { provider } = recorder();
  expect(withSubjectPrefix(provider)).toBe(provider);
  expect(withSubjectPrefix(provider, "")).toBe(provider);
  expect(withSubjectPrefix(provider, "   ")).toBe(provider);
});

it("trims the prefix", async () => {
  const { provider, sent } = recorder();
  await withSubjectPrefix(provider, " [staging] ").send(message);
  expect(sent[0]?.subject).toBe("[staging] Hello");
});
