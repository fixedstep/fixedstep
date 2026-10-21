import { fileURLToPath } from "node:url";
import { serializeBundle } from "@fixedstep/content-cli/bundle";
import { loadContent } from "@fixedstep/content-cli/load";
import { courses } from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { beforeAll, expect, it } from "vitest";
import { internalRoutes } from "./internal";

const token = "c".repeat(32);
const SAMPLE = fileURLToPath(new URL("../../../../content-sample", import.meta.url));

let db: Awaited<ReturnType<typeof createTestDb>>;
let app: ReturnType<typeof internalRoutes>;

beforeAll(async () => {
  db = await createTestDb();
  app = internalRoutes({ db: db as never }, { contentSyncToken: token });
});

const publish = (body: string, auth = `Bearer ${token}`) =>
  app.request("/content", { method: "POST", headers: { authorization: auth }, body });

it("rejects a missing or wrong token", async () => {
  const body = serializeBundle([]);
  expect((await app.request("/content", { method: "POST", body })).status).toBe(401);
  expect((await publish(body, `Bearer ${"x".repeat(32)}`)).status).toBe(401);
});

it("rejects bundles from another platform version", async () => {
  const res = await publish(JSON.stringify({ version: 999, createdAt: "", courses: [] }));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: expect.stringMatching(/unsupported bundle/) });
});

it("rejects malformed bundles", async () => {
  for (const body of ["not json", "null", JSON.stringify({ version: 1 })]) {
    const res = await publish(body);
    expect(res.status).toBe(400);
  }
  const res = await publish(JSON.stringify({ version: 1, createdAt: "", courses: [{}] }));
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: expect.stringMatching(/invalid bundle/) });
});

it("syncs a bundle into the database", async () => {
  const loaded = await loadContent(SAMPLE);
  const res = await publish(serializeBundle(loaded));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ courses: loaded.length });
  const rows = await db.select({ slug: courses.slug }).from(courses);
  expect(rows.map((r) => r.slug).sort()).toEqual(loaded.map((c) => c.slug).sort());
});
