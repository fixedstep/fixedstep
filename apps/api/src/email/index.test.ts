import { afterEach, expect, it, vi } from "vitest";
import { loadEmailEnv } from "../env";
import { createEmailProvider } from "./index";

afterEach(() => {
  vi.restoreAllMocks();
});

const message = { to: "a@b.c", subject: "Hello", text: "t", html: "<p>h</p>" };

it("uses the log provider by default and prints the unprefixed subject", async () => {
  const printed = vi.spyOn(console, "log").mockImplementation(() => {});
  const provider = createEmailProvider(loadEmailEnv({}));
  expect(provider.name).toBe("log");
  await provider.send(message);
  expect(printed.mock.calls.join("\n")).toContain('subject="Hello"');
});

it("applies the subject prefix to the log provider", async () => {
  const printed = vi.spyOn(console, "log").mockImplementation(() => {});
  const provider = createEmailProvider(loadEmailEnv({ EMAIL_SUBJECT_PREFIX: "[staging]" }));
  expect(provider.name).toBe("log");
  await provider.send(message);
  expect(printed.mock.calls.join("\n")).toContain('subject="[staging] Hello"');
});

it("chooses the smtp provider when configured, keeping its name under a prefix", () => {
  const env = loadEmailEnv({
    EMAIL_PROVIDER: "smtp",
    SMTP_URL: "smtp://u:p@mail.test:587",
    EMAIL_FROM: "f@x.test",
  });
  expect(createEmailProvider(env).name).toBe("smtp");
  expect(createEmailProvider({ ...env, EMAIL_SUBJECT_PREFIX: "[staging]" }).name).toBe("smtp");
});

it("does not touch the network for the log provider", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  // SMTP_URL is ignored unless EMAIL_PROVIDER=smtp.
  const provider = createEmailProvider(loadEmailEnv({ SMTP_URL: "smtp://u:p@127.0.0.1:1" }));
  await expect(provider.send(message)).resolves.toBeUndefined();
});
