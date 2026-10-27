import type { CourseOutline } from "@fixedstep/content-schema";
import { chapters, courseRatings, courses, lessonProgress, lessons, user } from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import type { AppEnv } from "../context";
import { NO_RATING } from "../lib/ratings";
import { courseRoutes } from "./courses";

let db: Awaited<ReturnType<typeof createTestDb>>;
let app: Hono<AppEnv>;
const ids: Record<string, string> = {};

const one = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error("expected a row");
  return row;
};

const addCourse = async (
  slug: string,
  position: number,
  opts: { published?: boolean; archivedAt?: Date } = {},
) => {
  const course = one(
    await db
      .insert(courses)
      .values({
        slug,
        title: slug,
        description: "",
        position,
        published: opts.published ?? true,
        archivedAt: opts.archivedAt,
      })
      .returning(),
  );
  const chapter = one(
    await db
      .insert(chapters)
      .values({ courseId: course.id, slug: "ch", title: "Ch", position: 0 })
      .returning(),
  );
  const lesson = one(
    await db
      .insert(lessons)
      .values({
        chapterId: chapter.id,
        slug: "l",
        title: "L",
        kind: "reading",
        access: "free",
        xp: 10,
        position: 0,
        bodyMd: "",
        contentHash: slug,
      })
      .returning(),
  );
  ids[slug] = course.id;
  ids[`${slug}-lesson`] = lesson.id;
};

const addUser = async (id: string, doneIn: string[], isAnonymous = false) => {
  await db.insert(user).values({ id, name: id, email: `${id}@test.dev`, isAnonymous });
  for (const slug of doneIn) {
    await db
      .insert(lessonProgress)
      .values({ userId: id, lessonId: ids[`${slug}-lesson`] as string });
  }
};

beforeAll(async () => {
  db = await createTestDb();
  await addCourse("a", 0);
  await addCourse("b", 1);
  await addCourse("draft", 2, { published: false });
  await addCourse("old", 3, { archivedAt: new Date() });

  await addCourse("t", 4);
  await addCourse("arch", 5);
  // Content sync later archived the only chapter and lesson of "arch".
  await db
    .update(chapters)
    .set({ archivedAt: new Date() })
    .where(eq(chapters.courseId, ids.arch as string));
  await db
    .update(lessons)
    .set({ archivedAt: new Date() })
    .where(eq(lessons.id, ids["arch-lesson"] as string));

  await addUser("member", ["a", "draft", "old", "arch"]);
  for (const t of ["t1", "t2", "t3", "t4"]) await addUser(t, ["t"]);
  await addUser("other", ["b"]);
  await addUser("guest", ["a"], true);
  await addUser("nobody", []);
  for (const r of ["r1", "r2", "r3", "r4"]) await addUser(r, ["a"]);

  app = new Hono<AppEnv>();
  app.use(async (c, next) => {
    const id = c.req.header("x-user");
    c.set("user", id ? ({ id, isAnonymous: id === "guest" } as never) : null);
    await next();
  });
  app.route("/", courseRoutes({ db } as never));
}, 30_000);

const headers = (u: string | null): Record<string, string> => ({
  "content-type": "application/json",
  ...(u ? { "x-user": u } : {}),
});

const put = (u: string | null, slug: string, body?: unknown) =>
  app.request(`/courses/${slug}/rating`, {
    method: "PUT",
    headers: headers(u),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const outline = async (u: string | null, slug: string) => {
  const res = await app.request("/courses", { headers: headers(u) });
  expect(res.status).toBe(200);
  const course = ((await res.json()) as CourseOutline[]).find((c) => c.slug === slug);
  if (!course) throw new Error(`no course ${slug}`);
  return course;
};

const ratingRows = (u: string, slug: string) =>
  db
    .select()
    .from(courseRatings)
    .where(and(eq(courseRatings.userId, u), eq(courseRatings.courseId, ids[slug] as string)));

/** Replaces every rating on `slug` with `byUser`, so a test doesn't lean on earlier ones. */
const setRatings = async (slug: string, byUser: Record<string, number>) => {
  await db.delete(courseRatings).where(eq(courseRatings.courseId, ids[slug] as string));
  for (const [u, stars] of Object.entries(byUser)) {
    expect((await put(u, slug, { stars })).status, u).toBe(200);
  }
};

describe("PUT /courses/:slug/rating eligibility", () => {
  it("401s without a user", async () => {
    expect((await put(null, "a", { stars: 4 })).status).toBe(401);
  });

  it("403s a guest, even with progress", async () => {
    const res = await put("guest", "a", { stars: 4 });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "create an account to rate" });
  });

  it("403s a user whose progress is in a different course", async () => {
    const res = await put("other", "a", { stars: 4 });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "complete a lesson first" });
  });

  it("403s a user with no progress", async () => {
    expect((await put("nobody", "a", { stars: 4 })).status).toBe(403);
  });

  it("404s unknown, unpublished and archived courses", async () => {
    for (const slug of ["nope", "draft", "old", "Not_A_Slug"]) {
      expect((await put("member", slug, { stars: 4 })).status, slug).toBe(404);
    }
  });

  it("400s bad stars", async () => {
    await setRatings("a", {});
    for (const body of [{ stars: 0 }, { stars: 6 }, { stars: 3.5 }, { stars: "4" }, undefined]) {
      expect((await put("member", "a", body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await ratingRows("member", "a")).toHaveLength(0);
  });
});

describe("PUT /courses/:slug/rating edge cases", () => {
  it("403s a guest before looking up the course (unpublished, unknown)", async () => {
    for (const slug of ["draft", "nope"]) {
      const res = await put("guest", slug, { stars: 4 });
      expect(res.status, slug).toBe(403);
      expect(await res.json()).toEqual({ error: "create an account to rate" });
    }
  });

  it("404s before validating the body", async () => {
    expect((await put("member", "draft", { stars: 99 })).status).toBe(404);
  });

  it("400s before checking progress", async () => {
    expect((await put("nobody", "a", { stars: 0 })).status).toBe(400);
  });

  it("400s malformed JSON", async () => {
    await setRatings("a", {});
    const res = await app.request("/courses/a/rating", {
      method: "PUT",
      headers: headers("member"),
      body: "{not json",
    });
    expect(res.status).toBe(400);
    expect(await ratingRows("member", "a")).toHaveLength(0);
  });

  it("counts a completion on a lesson that was later archived", async () => {
    await setRatings("arch", {});
    const res = await put("member", "arch", { stars: 4 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ average: null, count: 1, mine: 4 });
  });
});

describe("rating aggregates at the boundaries", () => {
  it("shows an integer average at exactly the threshold", async () => {
    await setRatings("t", { t1: 4, t2: 4 });
    expect((await outline(null, "t")).rating).toEqual({ average: null, count: 2, mine: null });
    await put("t3", "t", { stars: 4 });
    expect((await outline("t3", "t")).rating).toEqual({ average: 4, count: 3, mine: 4 });
  });

  it("rounds a .25 tie up (4, 4, 4, 5 → 4.3)", async () => {
    await setRatings("t", { t1: 4, t2: 4, t3: 4, t4: 5 });
    expect((await outline(null, "t")).rating).toEqual({ average: 4.3, count: 4, mine: null });
  });

  it("keeps mine null for an anonymous request even with ratings", async () => {
    await setRatings("t", { t1: 4, t2: 4, t3: 4, t4: 5 });
    const rating = (await outline(null, "t")).rating;
    expect(rating.count).toBe(4);
    expect(rating.mine).toBeNull();
  });
});

describe("rating aggregates", () => {
  it("updates an existing rating instead of adding one", async () => {
    await setRatings("a", {});
    expect((await put("member", "a", { stars: 3 })).status).toBe(200);
    const res = await put("member", "a", { stars: 5 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ average: null, count: 1, mine: 5 });
    const rows = await ratingRows("member", "a");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.stars).toBe(5);
  });

  it("hides the average below 3 ratings and rounds it to one decimal at 3", async () => {
    await setRatings("a", { member: 5 });
    // With r1 at 4 there are 2 ratings.
    await put("r1", "a", { stars: 4 });
    expect((await outline(null, "a")).rating).toEqual({ average: null, count: 2, mine: null });

    await put("r2", "a", { stars: 4 });
    const res = await put("r2", "a", { stars: 4 });
    // 4, 4, 5 → 4.333… → 4.3
    expect(await res.json()).toEqual({ average: 4.3, count: 3, mine: 4 });
    expect((await outline(null, "a")).rating).toEqual({ average: 4.3, count: 3, mine: null });
  });

  it("reports the caller's own rating as mine", async () => {
    await setRatings("a", { member: 5, r1: 4 });
    await setRatings("b", {});
    expect((await outline("member", "a")).rating.mine).toBe(5);
    expect((await outline("r1", "a")).rating.mine).toBe(4);
    expect((await outline("r3", "a")).rating.mine).toBeNull();
    expect((await outline("member", "b")).rating).toEqual(NO_RATING);
  });

  it("drops a deleted user's rating", async () => {
    await setRatings("a", { member: 5, r1: 4, r2: 4, r4: 1 });
    expect((await outline(null, "a")).rating.count).toBe(4);
    await db.delete(user).where(eq(user.id, "r4"));
    expect((await outline(null, "a")).rating).toEqual({ average: 4.3, count: 3, mine: null });
  });
});

describe("hint text", () => {
  it("never appears in the course list", async () => {
    await db
      .update(lessons)
      .set({ hints: ["SECRET-HINT-ONE", "SECRET-HINT-TWO"] })
      .where(eq(lessons.id, ids["a-lesson"] as string));
    for (const u of [null, "member"]) {
      const res = await app.request("/courses", { headers: headers(u) });
      const text = await res.text();
      expect(text).not.toContain("SECRET-HINT");
      expect(text).not.toContain("hints");
    }
  });
});
