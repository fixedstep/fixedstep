import { fileURLToPath } from "node:url";
import { serializeBundle } from "@fixedstep/content-cli/bundle";
import { loadContent } from "@fixedstep/content-cli/load";
import { lessons, submissions, user, xpEvents } from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import type { AppEnv } from "../context";
import { GraderBusyError } from "../lib/grader";
import { internalRoutes } from "./internal";
import { lessonRoutes } from "./lessons";

const token = "c".repeat(32);
const SAMPLE = fileURLToPath(new URL("../../../../content-sample", import.meta.url));

let db: Awaited<ReturnType<typeof createTestDb>>;
let app: Hono<AppEnv>;
let lessonId: string;
let caught: unknown;
const grader = vi.fn();

beforeAll(async () => {
  db = await createTestDb();
  const sync = internalRoutes({ db: db as never }, { contentSyncToken: token });
  const res = await sync.request("/content", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: serializeBundle(await loadContent(SAMPLE)),
  });
  expect(res.status).toBe(200);
  await db.insert(user).values({ id: "u1", name: "Test", email: "u1@test.dev" });
  const [row] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.slug, "moving-with-delta-time"));
  lessonId = row?.id as string;

  app = new Hono<AppEnv>();
  app.use(async (c, next) => {
    c.set("user", { id: "u1" } as never);
    await next();
  });
  app.route("/", lessonRoutes({ db, grader } as never));
  app.onError((err, c) => {
    caught = err;
    return c.json({ error: "internal error" }, 500);
  });
}, 30_000);

beforeEach(() => {
  grader.mockReset();
  caught = undefined;
});

const submit = () =>
  app.request(`/lessons/${lessonId}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: "export const x = 1;" }),
  });

const submissionCount = async () =>
  (await db.select().from(submissions).where(eq(submissions.userId, "u1"))).length;

it("answers 503 and records nothing when the grader is busy", async () => {
  grader.mockRejectedValue(new GraderBusyError("grader busy (last: 429)"));
  const res = await submit();
  expect(res.status).toBe(503);
  expect(res.headers.get("retry-after")).toBe("5");
  expect(await res.json()).toEqual({ error: expect.stringMatching(/busy/) });
  expect(await submissionCount()).toBe(0);
  expect(await db.select().from(xpEvents).where(eq(xpEvents.userId, "u1"))).toHaveLength(0);
});

it("lets other grader errors propagate", async () => {
  const err = new Error("grader failed: 400");
  grader.mockRejectedValue(err);
  const res = await submit();
  expect(res.status).toBe(500);
  expect(caught).toBe(err);
  expect(await submissionCount()).toBe(0);
});
