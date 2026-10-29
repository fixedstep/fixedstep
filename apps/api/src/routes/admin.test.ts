import { CourseMetrics } from "@fixedstep/content-schema";
import { chapters, courses, lessons, user } from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppEnv } from "../context";
import { adminRoutes } from "./admin";

let app: Hono<AppEnv>;
let db: Awaited<ReturnType<typeof createTestDb>>;

const one = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error("expected a row");
  return row;
};

const users: Record<string, { emailVerified: boolean; isAnonymous: boolean }> = {
  admin: { emailVerified: true, isAnonymous: false },
  plain: { emailVerified: true, isAnonymous: false },
  unverified: { emailVerified: false, isAnonymous: false },
  guest: { emailVerified: true, isAnonymous: true },
};

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values([
    { id: "admin", name: "A", email: "a@t.dev", emailVerified: true, role: "admin" },
    { id: "plain", name: "P", email: "p@t.dev", emailVerified: true },
    { id: "unverified", name: "U", email: "u@t.dev", role: "admin" },
    {
      id: "guest",
      name: "G",
      email: "g@t.dev",
      emailVerified: true,
      isAnonymous: true,
      role: "admin",
    },
  ]);
  const course = one(
    await db
      .insert(courses)
      .values({ slug: "c", title: "C", description: "", position: 0, published: true })
      .returning(),
  );
  const chapter = one(
    await db
      .insert(chapters)
      .values({ courseId: course.id, slug: "ch", title: "Ch", position: 0 })
      .returning(),
  );
  await db.insert(lessons).values({
    chapterId: chapter.id,
    slug: "l",
    title: "L",
    kind: "code",
    access: "free",
    xp: 1,
    position: 0,
    bodyMd: "",
    hiddenTests: "HIDDEN-TESTS-MARKER",
    solution: "SOLUTION-MARKER",
    quiz: [
      { id: "q", prompt: "p", options: ["a", "b"], answer: 1, explanation: "QUIZ-EXPLAIN-MARKER" },
    ],
    hints: ["HINT-TEXT-MARKER"],
    contentHash: "h",
  });

  app = new Hono<AppEnv>();
  // `x-user` picks the caller; absent means signed out.
  app.use(async (c, next) => {
    const id = c.req.header("x-user");
    c.set("user", id ? ({ id, ...users[id] } as never) : null);
    await next();
  });
  app.route("/", adminRoutes({ db: db as never }));
});

const get = (path: string, who?: string) =>
  app.request(path, { headers: who ? { "x-user": who } : {} });

describe("admin metrics", () => {
  it.each(["/admin/metrics", "/admin/metrics/c"])("%s: 401 when signed out", async (path) => {
    expect((await get(path)).status).toBe(401);
  });

  it.each(["/admin/metrics", "/admin/metrics/c"])(
    "%s: 403 for a non-admin, an unverified admin and a guest",
    async (path) => {
      for (const who of ["plain", "unverified", "guest"]) {
        expect((await get(path, who)).status, who).toBe(403);
      }
    },
  );

  it("serves every course to a verified admin, without lesson content", async () => {
    const res = await get("/admin/metrics", "admin");
    expect(res.status).toBe(200);
    const text = await res.text();
    const body = JSON.parse(text);
    expect(body.map((c: unknown) => CourseMetrics.parse(c).slug)).toEqual(["c"]);
    for (const secret of ["HIDDEN-TESTS-MARKER", "SOLUTION-MARKER", "HINT-TEXT-MARKER"]) {
      expect(text).not.toContain(secret);
    }
  });

  it.each(["/admin/metrics", "/admin/metrics/c", "/admin/metrics/nope"])(
    "%s: is not cacheable",
    async (path) => {
      expect((await get(path, "admin")).headers.get("cache-control")).toBe("no-store");
    },
  );

  it("serves one course, 404 for an unknown or malformed slug", async () => {
    const res = await get("/admin/metrics/c", "admin");
    expect(CourseMetrics.parse(await res.json()).lessons).toHaveLength(1);
    expect((await get("/admin/metrics/nope", "admin")).status).toBe(404);
    expect((await get("/admin/metrics/NOT%20A%20SLUG", "admin")).status).toBe(404);
  });
});

describe("admin metrics: escalation and leaks", () => {
  it("re-reads the role on every request, so a revoke applies at once", async () => {
    expect((await get("/admin/metrics", "plain")).status).toBe(403);
    await db.update(user).set({ role: "admin" }).where(eq(user.id, "plain"));
    expect((await get("/admin/metrics", "plain")).status).toBe(200);
    await db.update(user).set({ role: "user" }).where(eq(user.id, "plain"));
    expect((await get("/admin/metrics", "plain")).status).toBe(403);
  });

  it("403s a header user that is not in the DB", async () => {
    expect((await get("/admin/metrics", "ghost")).status).toBe(403);
  });

  it("does not run the metrics query for forbidden callers (no body leaked)", async () => {
    const res = await get("/admin/metrics/c", "unverified");
    expect(await res.json()).toEqual({ error: "forbidden" });
  });

  it("never returns hidden tests, solution, hint text or quiz data", async () => {
    for (const path of ["/admin/metrics", "/admin/metrics/c"]) {
      const text = await (await get(path, "admin")).text();
      for (const s of [
        "HIDDEN-TESTS-MARKER",
        "SOLUTION-MARKER",
        "HINT-TEXT-MARKER",
        "QUIZ-EXPLAIN-MARKER",
      ]) {
        expect(text).not.toContain(s);
      }
      expect(text).not.toMatch(/"answer"|"hiddenTests"|"solution"|"quiz"/);
    }
  });
});
