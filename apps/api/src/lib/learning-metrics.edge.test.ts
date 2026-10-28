import { CourseMetrics } from "@fixedstep/content-schema";
import { chapters, courses, lessonProgress, lessons, submissions, user } from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { courseMetrics } from "./learning-metrics";

let db: Awaited<ReturnType<typeof createTestDb>>;
let t = Date.UTC(2026, 0, 1);

const one = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error("expected a row");
  return row;
};

const submit = async (userId: string, lessonId: string, statuses: string[]) => {
  for (const status of statuses) {
    t += 1000;
    await db.insert(submissions).values({
      userId,
      lessonId,
      contentHash: "h",
      status: status as "passed",
      result: {},
      createdAt: new Date(t),
    });
  }
  if (statuses.includes("passed")) await db.insert(lessonProgress).values({ userId, lessonId });
};

const makeCourse = async (slug: string, position: number, lessonCount: number, hints: string[]) => {
  const course = one(
    await db
      .insert(courses)
      .values({ slug, title: slug, description: "", position, published: true })
      .returning(),
  );
  const chapter = one(
    await db
      .insert(chapters)
      .values({ courseId: course.id, slug: "ch", title: "Ch", position: 0 })
      .returning(),
  );
  const ids: string[] = [];
  for (let i = 0; i < lessonCount; i++) {
    const l = one(
      await db
        .insert(lessons)
        .values({
          chapterId: chapter.id,
          slug: `l${i}`,
          title: `l${i}`,
          kind: "quiz",
          access: "free",
          xp: 1,
          position: i,
          bodyMd: "",
          hiddenTests: "HT-SECRET",
          solution: "SOL-SECRET",
          quiz: [
            { id: "q", prompt: "p", options: ["a", "b"], answer: 1, explanation: "EXP-SECRET" },
          ],
          hints,
          contentHash: `${slug}${i}`,
        })
        .returning(),
    );
    ids.push(l.id);
  }
  return ids;
};

const course = async (slug: string) => one(await courseMetrics(db as never, { courseSlug: slug }));

let even: string[];
let stalled: string[];

beforeAll(async () => {
  db = await createTestDb();
  await db
    .insert(user)
    .values(["u1", "u2", "u3", "u4"].map((id) => ({ id, name: id, email: `${id}@t.dev` })));
  await makeCourse("empty", 0, 2, ["HINT-SECRET"]);
  even = await makeCourse("even", 1, 1, []);
  stalled = await makeCourse("stalled", 2, 2, []);

  // even: attempts to pass 1, 2, 3, 4 -> median 2.5
  await submit("u1", even[0] as string, ["passed"]);
  await submit("u2", even[0] as string, ["failed", "passed"]);
  await submit("u3", even[0] as string, ["error", "failed", "passed"]);
  await submit("u4", even[0] as string, ["failed", "failed", "failed", "passed"]);

  // stalled: nobody completes lesson 0, but u1 starts lesson 1 anyway; u2 only fails lesson 0.
  await submit("u1", stalled[1] as string, ["failed"]);
  await submit("u2", stalled[0] as string, ["failed"]);
});

describe("courseMetrics edge cases", () => {
  it("handles a course with no submissions without NaN or divide-by-zero", async () => {
    const c = await course("empty");
    expect(c).toMatchObject({ learners: 0, completers: 0, completionRate: null });
    expect(c.rating).toEqual({ average: null, count: 0 });
    for (const l of c.lessons) {
      expect(l).toMatchObject({
        starts: 0,
        completions: 0,
        medianAttemptsToPass: null,
        hintUnlocks: 0,
        learnersWithHints: 0,
        hintsAvailable: 1,
        dropOffFromPrev: null,
      });
    }
    expect(JSON.stringify(c)).not.toMatch(/NaN|Infinity/);
    CourseMetrics.parse(c);
  });

  it("averages the two middle values for an even number of attempts", async () => {
    expect((await course("even")).lessons[0]?.medianAttemptsToPass).toBe(2.5);
  });

  it("reports no drop-off on the first lesson, and null when the previous has no completions", async () => {
    const [first, second] = (await course("stalled")).lessons;
    expect(first?.dropOffFromPrev).toBeNull();
    expect(second?.dropOffFromPrev).toBeNull();
    expect(second?.starts).toBe(1);
  });

  it("reports zero hints for lessons without any, whatever the failures", async () => {
    const l = (await course("even")).lessons[0];
    expect(l).toMatchObject({ hintsAvailable: 0, hintUnlocks: 0, learnersWithHints: 0 });
  });

  it("reports total drop-off when nobody who finished the previous lesson continues", async () => {
    await submit("u3", stalled[0] as string, ["passed"]);
    const [, second] = (await course("stalled")).lessons;
    expect(second?.dropOffFromPrev).toBe(1);
    // u1 started lesson 1 without completing lesson 0: not counted as continuing.
    expect(second?.starts).toBe(1);
  });

  it("exposes only the whitelisted fields and no content", async () => {
    const all = await courseMetrics(db as never);
    const json = JSON.stringify(all);
    for (const secret of ["HT-SECRET", "SOL-SECRET", "EXP-SECRET", "HINT-SECRET"]) {
      expect(json).not.toContain(secret);
    }
    for (const c of all) {
      expect(Object.keys(c).sort()).toEqual(
        [
          "completers",
          "completionRate",
          "lessons",
          "learners",
          "published",
          "rating",
          "slug",
          "title",
        ].sort(),
      );
      for (const l of c.lessons) {
        expect(Object.keys(l).sort()).toEqual(
          [
            "chapterSlug",
            "completions",
            "dropOffFromPrev",
            "hintUnlocks",
            "hintsAvailable",
            "kind",
            "learnersWithHints",
            "lessonId",
            "medianAttemptsToPass",
            "slug",
            "starts",
            "title",
          ].sort(),
        );
      }
    }
  });
});
