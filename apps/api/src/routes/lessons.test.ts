import { fileURLToPath } from "node:url";
import { serializeBundle } from "@fixedstep/content-cli/bundle";
import { type LoadedCourse, loadContent } from "@fixedstep/content-cli/load";
import type { HintStatus, LessonHints } from "@fixedstep/content-schema";
import { entitlements, lessons, submissions, user, xpEvents } from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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
let loaded: LoadedCourse[];
const grader = vi.fn();

beforeAll(async () => {
  db = await createTestDb();
  const sync = internalRoutes({ db: db as never }, { contentSyncToken: token });
  loaded = await loadContent(SAMPLE);
  const res = await sync.request("/content", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: serializeBundle(loaded),
  });
  expect(res.status).toBe(200);
  await db.insert(user).values([
    { id: "u1", name: "Test", email: "u1@test.dev" },
    { id: "u2", name: "Hints", email: "u2@test.dev" },
    { id: "pro", name: "Pro", email: "pro@test.dev" },
  ]);
  await db.insert(entitlements).values({
    userId: "pro",
    kind: "pro",
    provider: "test",
    externalId: "sub_pro",
    status: "active",
  });
  const [row] = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(eq(lessons.slug, "moving-with-delta-time"));
  lessonId = row?.id as string;

  app = new Hono<AppEnv>();
  // `x-user` picks the caller (default u1); `none` means signed out.
  app.use(async (c, next) => {
    const id = c.req.header("x-user") ?? "u1";
    c.set("user", id === "none" ? null : ({ id } as never));
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

const submit = (as = "u1") =>
  app.request(`/lessons/${lessonId}/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-user": as },
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

const sampleLessons = () =>
  loaded.flatMap((c) => c.chaptersLoaded.flatMap((ch) => ch.lessonsLoaded));
const sampleHints = () => sampleLessons().find((l) => l.slug === "moving-with-delta-time")?.hints;
const get = (path: string, as = "u1") => app.request(path, { headers: { "x-user": as } });
const gradeAs = (status: "passed" | "failed" | "error") =>
  grader.mockResolvedValue({ status, results: [], durationMs: 1 });
/** hintStatus of a lesson detail or submit response. */
const statusOf = async (res: Response | Promise<Response>) =>
  ((await (await res).json()) as { hintStatus: HintStatus }).hintStatus;
const hintsOf = async (as: string) =>
  (await (await get(`/lessons/${lessonId}/hints`, as)).json()) as LessonHints;

describe("hint ladder", () => {
  it("unlocks nothing before a failed submission", async () => {
    expect(sampleHints()).toHaveLength(3);
    const hints = await get(`/lessons/${lessonId}/hints`, "u2");
    expect(hints.status).toBe(200);
    expect(await hints.json()).toEqual({ total: 3, unlocked: 0, hints: [] });
    expect(await statusOf(get(`/lessons/${lessonId}`, "u2"))).toEqual({ total: 3, unlocked: 0 });
  });

  it("unlocks one hint per failed or errored submission, up to the total", async () => {
    const all = sampleHints() as string[];

    gradeAs("failed");
    expect(await statusOf(submit("u2"))).toEqual({ total: 3, unlocked: 1 });
    expect(await hintsOf("u2")).toEqual({ total: 3, unlocked: 1, hints: all.slice(0, 1) });

    gradeAs("passed");
    expect(await statusOf(submit("u2"))).toEqual({ total: 3, unlocked: 1 });

    gradeAs("error");
    expect(await statusOf(submit("u2"))).toEqual({ total: 3, unlocked: 2 });
    expect((await hintsOf("u2")).hints).toEqual(all.slice(0, 2));

    gradeAs("failed");
    await submit("u2");
    expect(await statusOf(submit("u2"))).toEqual({ total: 3, unlocked: 3 });
    expect(await hintsOf("u2")).toEqual({ total: 3, unlocked: 3, hints: all });
    expect(await statusOf(get(`/lessons/${lessonId}`, "u2"))).toEqual({ total: 3, unlocked: 3 });
  });

  it("unlocks nothing for a signed-out visitor", async () => {
    const res = await get(`/lessons/${lessonId}/hints`, "none");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ total: 3, unlocked: 0, hints: [] });
  });

  it("keeps hints of paid lessons behind the paywall", async () => {
    const [paid] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(eq(lessons.slug, "bouncing-ball"));
    const res = await get(`/lessons/${paid?.id}/hints`);
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ locked: true });
  });

  it("never leaks hints, solutions, hidden tests or quiz answers through lesson responses", async () => {
    const escaped = (s: string) => JSON.stringify(s).slice(1, -1);
    const secrets = sampleLessons().flatMap((l) => [
      ...l.hints,
      ...(l.solution ? [l.solution] : []),
      ...(l.hiddenTests ? [l.hiddenTests] : []),
      ...(l.quiz ?? []).flatMap((q) => (q.explanation ? [q.explanation] : [])),
    ]);
    expect(secrets.length).toBeGreaterThan(3);
    const expectNoSecrets = (text: string) => {
      for (const s of secrets) expect(text).not.toContain(escaped(s));
    };

    const rows = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(isNull(lessons.archivedAt));
    expect(rows).toHaveLength(sampleLessons().length);
    for (const { id } of rows) {
      const res = await get(`/lessons/${id}`, "pro");
      expect(res.status).toBe(200);
      const text = await res.text();
      expectNoSecrets(text);
      const body = JSON.parse(text);
      expect(Object.keys(body).sort()).toEqual(
        [
          "id",
          "slug",
          "title",
          "kind",
          "access",
          "xp",
          "bodyMd",
          "starterCode",
          "visibleTests",
          "hasHiddenTests",
          "quiz",
          "completed",
          "hintStatus",
        ].sort(),
      );
      for (const q of body.quiz ?? [])
        expect(Object.keys(q).sort()).toEqual(["id", "options", "prompt"]);
    }

    gradeAs("passed");
    const res = await submit("pro");
    const text = await res.text();
    expectNoSecrets(text);
    expect(JSON.parse(text).hintStatus).toEqual({ total: 3, unlocked: 0 });
  });
});
