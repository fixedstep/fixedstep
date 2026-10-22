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
