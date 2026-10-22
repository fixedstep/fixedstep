import { expect, it } from "vitest";
import { loadEmailEnv, loadEnv } from "./env";

const base = {
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:5173",
  WEB_ORIGIN: "http://localhost:5173",
};

it("grades in-process by default", () => {
  expect(loadEnv(base).GRADER_MODE).toBe("local");
});

it("requires a URL and token for the grader service", () => {
  const http = { ...base, GRADER_MODE: "http" };
  expect(() => loadEnv(http)).toThrow(/GRADER_URL/);
  expect(() => loadEnv({ ...http, GRADER_URL: "http://grader:3001" })).toThrow(/GRADER_TOKEN/);
  expect(() =>
    loadEnv({ ...http, GRADER_URL: "http://grader:3001", GRADER_TOKEN: "short" }),
  ).toThrow();
  const env = loadEnv({ ...http, GRADER_URL: "http://grader:3001", GRADER_TOKEN: "g".repeat(32) });
  expect(env.GRADER_URL).toBe("http://grader:3001");
});

it("requires SMTP_URL and EMAIL_FROM when sending through SMTP", () => {
  const smtp = { ...base, EMAIL_PROVIDER: "smtp", SMTP_URL: "smtps://u:p@mail.test:465" };
  expect(loadEnv(base).EMAIL_PROVIDER).toBe("log");
  expect(() => loadEnv({ ...smtp, SMTP_URL: "" })).toThrow(/SMTP_URL/);
  expect(() => loadEnv(smtp)).toThrow(/EMAIL_FROM/);
  expect(loadEnv({ ...smtp, EMAIL_FROM: "a@b.c" }).EMAIL_FROM).toBe("a@b.c");
});

it("treats the subject prefix and Reply-To as optional, and empty as unset", () => {
  const env = loadEnv({ ...base, EMAIL_SUBJECT_PREFIX: "", EMAIL_REPLY_TO: "" });
  expect(env.EMAIL_SUBJECT_PREFIX).toBeUndefined();
  expect(env.EMAIL_REPLY_TO).toBeUndefined();
  const set = loadEnv({ ...base, EMAIL_SUBJECT_PREFIX: "[staging]", EMAIL_REPLY_TO: "hi@x.test" });
  expect(set.EMAIL_SUBJECT_PREFIX).toBe("[staging]");
  expect(set.EMAIL_REPLY_TO).toBe("hi@x.test");
});

it("rejects an unknown EMAIL_PROVIDER", () => {
  expect(() => loadEmailEnv({ EMAIL_PROVIDER: "sendgrid" })).toThrow();
  expect(() => loadEnv({ ...base, EMAIL_PROVIDER: "sendgrid" })).toThrow();
});

it("loadEmailEnv treats empty prefix and Reply-To as unset", () => {
  const env = loadEmailEnv({ EMAIL_SUBJECT_PREFIX: "", EMAIL_REPLY_TO: "" });
  expect(env.EMAIL_SUBJECT_PREFIX).toBeUndefined();
  expect(env.EMAIL_REPLY_TO).toBeUndefined();
});

it("loads only the email settings, without DB or auth vars", () => {
  const smtp = { EMAIL_PROVIDER: "smtp", SMTP_URL: "smtp://u:p@mail.test:587" };
  expect(loadEmailEnv({ ...smtp, EMAIL_FROM: "a@b.c" })).toMatchObject({
    EMAIL_PROVIDER: "smtp",
    EMAIL_FROM: "a@b.c",
  });
  expect(() => loadEmailEnv(smtp)).toThrow(/EMAIL_FROM/);
  expect(() => loadEmailEnv({ ...smtp, EMAIL_FROM: "" })).toThrow(/EMAIL_FROM/);
  expect(loadEmailEnv({}).EMAIL_PROVIDER).toBe("log");
});
