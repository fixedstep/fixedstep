import {
  chapters,
  courses,
  lessonProgress,
  lessons,
  session,
  submissions,
  user,
  xpEvents,
} from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { deleteStaleGuests, mergeGuestProgress } from "./guests";
import { hintStatus } from "./hints";
import { getStats } from "./progress";

let db: Awaited<ReturnType<typeof createTestDb>>;
let lessonA: string;
let lessonB: string;

const one = <T>(rows: T[]): T => {
  const [row] = rows;
  if (!row) throw new Error("expected a row");
  return row;
};

beforeAll(async () => {
  db = await createTestDb();
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
  const lesson = (slug: string, position: number) => ({
    chapterId: chapter.id,
    slug,
    title: slug,
    kind: "reading" as const,
    access: "free" as const,
    xp: 10,
    position,
    bodyMd: "",
    contentHash: slug,
  });
  const rows = await db
    .insert(lessons)
    .values([lesson("a", 0), lesson("b", 1)])
    .returning();
  [lessonA, lessonB] = rows.map((r) => r.id) as [string, string];
}, 30_000);

const addUser = (id: string, isAnonymous = false, createdAt = new Date()) =>
  db.insert(user).values({ id, name: id, email: `${id}@test.dev`, isAnonymous, createdAt });

describe("mergeGuestProgress", () => {
  it("moves progress, XP and submissions, keeping one award per lesson", async () => {
    await addUser("guest", true);
    await addUser("member");
    const day = (d: string) => new Date(`2026-10-${d}T12:00:00Z`);

    await db.insert(lessonProgress).values([
      { userId: "guest", lessonId: lessonA, completedAt: day("10") },
      { userId: "guest", lessonId: lessonB, completedAt: day("11") },
      { userId: "member", lessonId: lessonA, completedAt: day("12") },
    ]);
    await db.insert(xpEvents).values([
      {
        userId: "guest",
        amount: 15,
        reason: "lesson_complete",
        refId: lessonA,
        createdAt: day("10"),
      },
      {
        userId: "guest",
        amount: 10,
        reason: "lesson_complete",
        refId: lessonB,
        createdAt: day("11"),
      },
      {
        userId: "member",
        amount: 10,
        reason: "lesson_complete",
        refId: lessonA,
        createdAt: day("12"),
      },
    ]);
    await db.insert(submissions).values({
      userId: "guest",
      lessonId: lessonB,
      contentHash: "b",
      status: "passed",
      result: {},
    });

    await mergeGuestProgress(db, "guest", "member");

    const progress = await db
      .select()
      .from(lessonProgress)
      .where(eq(lessonProgress.userId, "member"));
    expect(progress).toHaveLength(2);
    expect(progress.find((p) => p.lessonId === lessonA)?.completedAt).toEqual(day("10"));

    const stats = await getStats(db, "member");
    expect(stats.xp).toBe(25); // max(15, 10) for A + 10 for B, not 35

    const subs = await db.select().from(submissions).where(eq(submissions.userId, "member"));
    expect(subs).toHaveLength(1);

    // Better Auth deletes the guest next; nothing of theirs may be left to cascade away.
    await db.delete(user).where(eq(user.id, "guest"));
    expect((await getStats(db, "member")).xp).toBe(25);
  });
});

describe("mergeGuestProgress and hints", () => {
  it("carries failed-submission counts so unlocked hints survive sign-up", async () => {
    await addUser("guest2", true);
    await addUser("member2");
    await db.insert(submissions).values(
      [0, 1].map(() => ({
        userId: "guest2",
        lessonId: lessonA,
        contentHash: "a",
        status: "failed" as const,
        result: {},
      })),
    );
    await db.insert(submissions).values({
      userId: "member2",
      lessonId: lessonA,
      contentHash: "a",
      status: "error",
      result: {},
    });
    await mergeGuestProgress(db, "guest2", "member2");
    await db.delete(user).where(eq(user.id, "guest2"));
    const rows = await db.select().from(submissions).where(eq(submissions.userId, "member2"));
    expect(rows.filter((r) => r.status !== "passed")).toHaveLength(3);
    expect(
      await hintStatus(db as never, "member2", { id: lessonA, hints: ["a", "b", "c", "d"] }),
    ).toEqual({
      total: 4,
      unlocked: 3,
    });
    await db.delete(user).where(eq(user.id, "member2"));
  });
});

describe("deleteStaleGuests", () => {
  it("deletes only old guests without a live session", async () => {
    const now = new Date("2026-10-19T12:00:00Z");
    const old = new Date("2026-10-01T00:00:00Z");
    await addUser("stale", true, old);
    await addUser("active", true, old);
    await addUser("fresh", true, new Date(now.getTime() - 60_000));
    await addUser("real", false, old);
    await db.insert(session).values([
      { id: "s1", token: "t1", userId: "stale", expiresAt: new Date("2026-10-08T00:00:00Z") },
      { id: "s2", token: "t2", userId: "active", expiresAt: new Date("2026-10-25T00:00:00Z") },
    ]);

    expect(await deleteStaleGuests(db, now)).toBe(1);
    const left = (await db.select({ id: user.id }).from(user)).map((u) => u.id).sort();
    expect(left).toEqual(["active", "fresh", "member", "real"]);
  });
});
