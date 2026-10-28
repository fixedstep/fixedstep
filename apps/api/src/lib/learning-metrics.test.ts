import { CourseMetrics } from "@fixedstep/content-schema";
import {
  chapters,
  courseRatings,
  courses,
  lessonProgress,
  lessons,
  submissions,
  user,
} from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { beforeAll, describe, expect, it } from "vitest";
import { courseMetrics } from "./learning-metrics";

let db: Awaited<ReturnType<typeof createTestDb>>;
const lessonIds: string[] = [];
let archivedLessonId: string;
let draftLessonId: string;
let t0 = Date.UTC(2026, 0, 1);

const one = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error("expected a row");
  return row;
};

const SECRETS = [
  "HIDDEN-TESTS-MARKER",
  "SOLUTION-MARKER",
  "QUIZ-ANSWER-MARKER",
  "HINT-TEXT-MARKER",
];

/** Submissions for one user/lesson in order, e.g. ["failed", "failed", "passed"]. */
const submit = async (userId: string, lessonId: string, statuses: string[]) => {
  for (const status of statuses) {
    t0 += 1000;
    await db.insert(submissions).values({
      userId,
      lessonId,
      contentHash: "h",
      status: status as "passed",
      result: {},
      createdAt: new Date(t0),
    });
  }
  if (statuses.includes("passed")) await db.insert(lessonProgress).values({ userId, lessonId });
};

const lesson = async (chapterId: string, slug: string, position: number, hints: string[]) =>
  one(
    await db
      .insert(lessons)
      .values({
        chapterId,
        slug,
        title: slug,
        kind: "code",
        access: "free",
        xp: 10,
        position,
        bodyMd: "",
        hiddenTests: SECRETS[0],
        solution: SECRETS[1],
        quiz: [{ id: "q", prompt: "p", options: ["a"], answer: 0, explanation: SECRETS[2] }],
        hints,
        contentHash: slug,
      })
      .returning(),
  );

beforeAll(async () => {
  db = await createTestDb();
  const course = one(
    await db
      .insert(courses)
      .values({ slug: "c", title: "C", description: "", position: 0, published: true })
      .returning(),
  );
  const draft = one(
    await db
      .insert(courses)
      .values({ slug: "draft", title: "D", description: "", position: 1 })
      .returning(),
  );
  await db
    .insert(courses)
    .values({ slug: "old", title: "O", description: "", position: 2, archivedAt: new Date() });
  const chapter = one(
    await db
      .insert(chapters)
      .values({ courseId: course.id, slug: "ch", title: "Ch", position: 0 })
      .returning(),
  );
  const draftChapter = one(
    await db
      .insert(chapters)
      .values({ courseId: draft.id, slug: "ch", title: "Ch", position: 0 })
      .returning(),
  );
  draftLessonId = (await lesson(draftChapter.id, "d1", 0, [])).id;
  const hints = ["HINT-TEXT-MARKER 1", "HINT-TEXT-MARKER 2"];
  lessonIds.push((await lesson(chapter.id, "l1", 0, hints)).id);
  lessonIds.push((await lesson(chapter.id, "l2", 1, [])).id);
  lessonIds.push((await lesson(chapter.id, "l3", 2, [])).id);
  archivedLessonId = one(
    await db
      .insert(lessons)
      .values({
        chapterId: chapter.id,
        slug: "gone",
        title: "gone",
        kind: "reading",
        access: "free",
        xp: 1,
        position: 3,
        bodyMd: "",
        contentHash: "g",
        archivedAt: new Date(),
      })
      .returning(),
  ).id;

  await db.insert(user).values([
    { id: "a", name: "a", email: "a@t.dev" },
    { id: "b", name: "b", email: "b@t.dev" },
    { id: "c", name: "c", email: "c@t.dev" },
    { id: "guest", name: "g", email: "g@t.dev", isAnonymous: true },
    { id: "fail", name: "f", email: "f@t.dev" },
  ]);
  const [l1, l2, l3] = lessonIds as [string, string, string];
  // a: passes l1 first try, l2 on the 2nd, l3 on the 1st (completes the course).
  await submit("a", l1, ["passed"]);
  await submit("a", l2, ["failed", "passed"]);
  await submit("a", l3, ["passed"]);
  // b: l1 on the 4th try (3 failures, only 2 hints exist), then drops off.
  await submit("b", l1, ["failed", "error", "failed", "passed"]);
  // c: l1 on the 2nd try, never starts l2.
  await submit("c", l1, ["failed", "passed"]);
  // guest: starts l1 and fails.
  await submit("guest", l1, ["failed"]);
  await submit("a", archivedLessonId, ["passed"]);
  // fail: only ever fails the draft course's lesson.
  await submit("fail", draftLessonId, ["failed"]);
  await db.insert(courseRatings).values([
    { userId: "a", courseId: course.id, stars: 5 },
    { userId: "b", courseId: course.id, stars: 4 },
  ]);
});

const course = async () => one(await courseMetrics(db as never, { courseSlug: "c" }));

describe("courseMetrics", () => {
  it("lists non-archived courses, drafts included", async () => {
    const all = await courseMetrics(db as never);
    expect(all.map((c) => [c.slug, c.published])).toEqual([
      ["c", true],
      ["draft", false],
    ]);
  });

  it("counts starts and completions, guests included", async () => {
    const [l1, l2, l3] = (await course()).lessons;
    expect([l1?.starts, l1?.completions]).toEqual([4, 3]);
    expect([l2?.starts, l2?.completions]).toEqual([1, 1]);
    expect([l3?.starts, l3?.completions]).toEqual([1, 1]);
  });

  it("takes the median attempts to pass, null when nobody passed", async () => {
    const [l1, l2] = (await course()).lessons;
    // a: 1, c: 2, b: 4 (the guest never passed).
    expect(l1?.medianAttemptsToPass).toBe(2);
    expect(l2?.medianAttemptsToPass).toBe(2);
    const draft = one(await courseMetrics(db as never, { courseSlug: "draft" }));
    expect(draft.lessons[0]?.medianAttemptsToPass).toBeNull();
  });

  it("caps hint unlocks at the number of hints", async () => {
    const [l1, l2] = (await course()).lessons;
    // available 2: a 0, b min(2,3)=2, c 1, guest 1.
    expect(l1).toMatchObject({ hintsAvailable: 2, hintUnlocks: 4, learnersWithHints: 3 });
    expect(l2).toMatchObject({ hintsAvailable: 0, hintUnlocks: 0, learnersWithHints: 0 });
  });

  it("measures drop-off between consecutive lessons", async () => {
    const [l1, l2, l3] = (await course()).lessons;
    expect(l1?.dropOffFromPrev).toBeNull();
    // l1 completers a, b, c; only a started l2.
    expect(l2?.dropOffFromPrev).toBeCloseTo(2 / 3);
    expect(l3?.dropOffFromPrev).toBe(0);
  });

  it("computes the completion rate over learners, ignoring archived lessons", async () => {
    const c = await course();
    expect(c.lessons.map((l) => l.slug)).toEqual(["l1", "l2", "l3"]);
    expect(c).toMatchObject({ learners: 4, completers: 1, completionRate: 0.25 });
  });

  it("reports raw rating counts below the display threshold", async () => {
    expect((await course()).rating).toEqual({ average: 4.5, count: 2 });
    const draft = one(await courseMetrics(db as never, { courseSlug: "draft" }));
    expect(draft).toMatchObject({
      published: false,
      learners: 1,
      completers: 0,
      completionRate: 0,
    });
    expect(draft.rating).toEqual({ average: null, count: 0 });
  });

  it("returns nothing for an unknown or archived course", async () => {
    expect(await courseMetrics(db as never, { courseSlug: "nope" })).toEqual([]);
    expect(await courseMetrics(db as never, { courseSlug: "old" })).toEqual([]);
  });

  it("never includes lesson content", async () => {
    const all = await courseMetrics(db as never);
    for (const c of all) CourseMetrics.parse(c);
    const json = JSON.stringify(all);
    for (const secret of SECRETS) expect(json).not.toContain(secret);
  });
});
