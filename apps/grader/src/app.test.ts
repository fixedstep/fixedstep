import { expect, it } from "vitest";
import { createGraderApp } from "./app";

const token = "t".repeat(32);
const result = { passed: true, tests: [] } as never;
const app = createGraderApp({ token, grade: async () => result });

const post = (body: unknown, auth?: string) =>
  app.request("/grade", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  });

const req = { code: "export const x = 1;", visibleTests: "" };

it("rejects missing or wrong tokens", async () => {
  expect((await post(req)).status).toBe(401);
  expect((await post(req, `Bearer ${"x".repeat(32)}`)).status).toBe(401);
  expect((await post(req, "Bearer short")).status).toBe(401);
});

it("rejects malformed requests", async () => {
  expect((await post({ code: 1 }, `Bearer ${token}`)).status).toBe(400);
});

it("grades with a valid token", async () => {
  const res = await post(req, `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual(result);
});
