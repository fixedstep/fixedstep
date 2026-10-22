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

it("answers 429 once the queue is full, and frees slots when runs finish", async () => {
  let finish = () => {};
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const busyApp = createGraderApp({
    token,
    maxQueued: 1,
    grade: async () => {
      await gate;
      return result;
    },
  });
  const send = (body: unknown) =>
    busyApp.request("/grade", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

  // A malformed body is rejected without holding on to its slot.
  expect((await send({ code: 1 })).status).toBe(400);

  const inFlight = [send(req), send(req), send(req)];
  await new Promise((r) => setTimeout(r, 10));
  finish();
  const responses = await Promise.all(inFlight);
  const statuses = responses.map((r) => r.status).sort();
  expect(statuses).toEqual([200, 200, 429]);
  const busy = responses.find((r) => r.status === 429);
  expect(await busy?.json()).toEqual({ error: "busy" });

  expect((await send(req)).status).toBe(200);
});

const authed = {
  "content-type": "application/json",
  authorization: `Bearer ${token}`,
};

it("frees its slot when grading throws", async () => {
  let calls = 0;
  const flaky = createGraderApp({
    token,
    maxQueued: 0,
    grade: async () => {
      if (calls++ < 3) throw new Error("boom");
      return result;
    },
  });
  const send = () =>
    flaky.request("/grade", { method: "POST", headers: authed, body: JSON.stringify(req) });
  for (let i = 0; i < 3; i++) expect((await send()).status).toBe(500);
  expect((await send()).status).toBe(200);
});

it("does not take a slot for unauthorized requests", async () => {
  const tiny = createGraderApp({ token, maxQueued: 0, grade: async () => result });
  for (let i = 0; i < 3; i++) {
    const res = await tiny.request("/grade", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  }
  const ok = await tiny.request("/grade", {
    method: "POST",
    headers: authed,
    body: JSON.stringify(req),
  });
  expect(ok.status).toBe(200);
});
