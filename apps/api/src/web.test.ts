import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Hono } from "hono";
import { beforeAll, expect, it } from "vitest";
import type { AppEnv } from "./context";
import { mountWeb } from "./web";

const app = new Hono<AppEnv>();

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), "fixedstep-web-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html>spa");
  writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
  app.get("/api/ping", (c) => c.text("pong"));
  // serveStatic resolves `root` against the working directory.
  mountWeb(app, relative(process.cwd(), dir));
});

it("serves hashed assets as immutable", async () => {
  const res = await app.request("/assets/app-abc123.js");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toContain("immutable");
});

it("serves index.html for / and for client-side routes, revalidated", async () => {
  for (const path of ["/", "/courses/intro/lessons/one"]) {
    const res = await app.request(path);
    expect(res.status, path).toBe(200);
    expect(await res.text()).toContain("spa");
    expect(res.headers.get("cache-control")).toBe("no-cache");
  }
});

it("404s missing files and unknown API routes instead of returning the SPA", async () => {
  expect((await app.request("/assets/missing.js")).status).toBe(404);
  expect((await app.request("/favicon.ico")).status).toBe(404);
  expect((await app.request("/api/nope")).status).toBe(404);
  expect(await (await app.request("/api/ping")).text()).toBe("pong");
});
