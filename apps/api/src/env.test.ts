import { expect, it } from "vitest";
import { loadEnv } from "./env";

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
