import { expect, it } from "vitest";
import { loadEnv } from "../env";
import { resetPasswordMessage, verifyEmailMessage } from "./templates";

const url = "https://fixedstep.test/api/auth/reset-password/tok?callbackURL=/a&b=<c>";

it("puts the link in both bodies, escaped in HTML", () => {
  const m = resetPasswordMessage(url);
  expect(m.text).toContain(url);
  expect(m.html).toContain(
    'href="https://fixedstep.test/api/auth/reset-password/tok?callbackURL=/a&amp;b=&lt;c&gt;"',
  );
  expect(m.html).not.toContain("<c>");
  expect(verifyEmailMessage(url).subject).toMatch(/verify/i);
});

it("requires SMTP_URL and EMAIL_FROM when sending through SMTP", () => {
  const base = {
    DATABASE_URL: "postgres://x",
    BETTER_AUTH_SECRET: "x".repeat(32),
    BETTER_AUTH_URL: "http://localhost:5173",
    WEB_ORIGIN: "http://localhost:5173",
  };
  const smtp = { ...base, EMAIL_PROVIDER: "smtp", SMTP_URL: "smtps://u:p@mail.test:465" };
  expect(loadEnv(base).EMAIL_PROVIDER).toBe("log");
  expect(() => loadEnv({ ...smtp, SMTP_URL: "" })).toThrow(/SMTP_URL/);
  expect(() => loadEnv(smtp)).toThrow(/EMAIL_FROM/);
  expect(loadEnv({ ...smtp, EMAIL_FROM: "a@b.c" }).EMAIL_FROM).toBe("a@b.c");
});
