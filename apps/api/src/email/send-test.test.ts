import { afterEach, expect, it, vi } from "vitest";
import { loadEmailEnv } from "../env";
import { sendTestEmail } from "./send-test";

afterEach(() => {
  vi.restoreAllMocks();
});

function sink() {
  const lines: string[] = [];
  const write = (...args: unknown[]) => {
    lines.push(args.join(" "));
  };
  return { lines, log: { log: write, warn: write, error: write } };
}

it("prints usage and returns 2 without a recipient", async () => {
  const { lines, log } = sink();
  expect(await sendTestEmail(undefined, loadEmailEnv({}), log)).toBe(2);
  expect(await sendTestEmail("not-an-address", loadEmailEnv({}), log)).toBe(2);
  expect(lines.join("\n")).toMatch(/usage/);
});

it("sends through the configured provider, with the subject prefix", async () => {
  const printed = vi.spyOn(console, "log").mockImplementation(() => {});
  const { lines, log } = sink();
  const env = loadEmailEnv({ EMAIL_SUBJECT_PREFIX: "[staging]" });
  expect(await sendTestEmail("a@b.c", env, log)).toBe(0);
  expect(lines.join("\n")).toMatch(/not sent/);
  expect(printed.mock.calls.join("\n")).toContain('subject="[staging] Fixedstep test email"');
});

it("returns 1 when the provider rejects the message", async () => {
  const { lines, log } = sink();
  const provider = {
    name: "smtp",
    send: () => Promise.reject(new Error("535 auth failed")),
  };
  expect(await sendTestEmail("a@b.c", loadEmailEnv({}), log, provider)).toBe(1);
  expect(lines.join("\n")).toContain("535 auth failed");
});

it("does not print SMTP_URL when the provider's error message contains it", async () => {
  const { lines, log } = sink();
  const url = "smtp://secret-token:secret-token@mail.test:587";
  const env = loadEmailEnv({ EMAIL_PROVIDER: "smtp", SMTP_URL: url, EMAIL_FROM: "f@x.test" });
  const provider = {
    name: "smtp",
    send: () => Promise.reject(new Error(`connect failed for ${url}`)),
  };
  expect(await sendTestEmail("a@b.c", env, log, provider)).toBe(1);
  expect(lines.join("\n")).not.toContain("secret-token");
});

it("masks the credentials of a reformatted URL in the provider's error", async () => {
  const { lines, log } = sink();
  const env = loadEmailEnv({
    EMAIL_PROVIDER: "smtp",
    SMTP_URL: "smtp://secret-token:secret-token@mail.test:587",
    EMAIL_FROM: "f@x.test",
  });
  const provider = {
    name: "smtp",
    send: () => Promise.reject(new Error("bad login smtps://secret-token:secret-token@mail.test/")),
  };
  expect(await sendTestEmail("a@b.c", env, log, provider)).toBe(1);
  const out = lines.join("\n");
  expect(out).not.toContain("secret-token");
  expect(out).toContain("smtps://***@mail.test/");
});

it("masks the token when the provider's error contains it on its own", async () => {
  const { lines, log } = sink();
  const env = loadEmailEnv({
    EMAIL_PROVIDER: "smtp",
    SMTP_URL: "smtp://secret-token:secret-token@mail.test:587",
    EMAIL_FROM: "f@x.test",
  });
  const provider = {
    name: "smtp",
    send: () => Promise.reject(new Error("535 invalid token secret-token")),
  };
  expect(await sendTestEmail("a@b.c", env, log, provider)).toBe(1);
  const out = lines.join("\n");
  expect(out).not.toContain("secret-token");
  expect(out).toContain("535 invalid token ***");
});

it("masks a URL-encoded password in both its encoded and decoded forms", async () => {
  const { lines, log } = sink();
  const env = loadEmailEnv({
    EMAIL_PROVIDER: "smtp",
    SMTP_URL: "smtp://user:pa%2Bss@mail.test:587",
    EMAIL_FROM: "f@x.test",
  });
  const provider = {
    name: "smtp",
    send: () => Promise.reject(new Error("rejected pa+ss (sent as pa%2Bss)")),
  };
  expect(await sendTestEmail("a@b.c", env, log, provider)).toBe(1);
  const out = lines.join("\n");
  expect(out).not.toContain("pa+ss");
  expect(out).not.toContain("pa%2Bss");
});

it("sends a message to the recipient with the test subject and sender in the body", async () => {
  const { log } = sink();
  const sent: { to: string; subject: string; text: string }[] = [];
  const provider = {
    name: "smtp",
    send: async (m: { to: string; subject: string; text: string }) => {
      sent.push(m);
    },
  };
  const env = loadEmailEnv({ EMAIL_FROM: "f@x.test" });
  expect(await sendTestEmail("a@b.c", env, log, provider)).toBe(0);
  expect(sent[0]?.to).toBe("a@b.c");
  expect(sent[0]?.subject).toBe("Fixedstep test email");
  expect(sent[0]?.text).toContain("f@x.test");
});

it("never prints SMTP_URL", async () => {
  const { lines, log } = sink();
  const env = loadEmailEnv({
    EMAIL_PROVIDER: "smtp",
    SMTP_URL: "smtp://secret-token:secret-token@mail.test:587",
    EMAIL_FROM: "f@x.test",
  });
  const provider = { name: "smtp", send: () => Promise.reject(new Error("timeout")) };
  await sendTestEmail("a@b.c", env, log, provider);
  await sendTestEmail("a@b.c", env, log, { name: "smtp", send: () => Promise.resolve() });
  expect(lines.join("\n")).not.toContain("secret-token");
});
