import { type Db, lessonProgress, xpEvents } from "@fixedstep/db";
import { desc, eq, sql } from "drizzle-orm";

/**
 * Marks a lesson complete and awards XP exactly once (idempotent via unique indexes).
 * Only call this after server-side verification. Returns the XP actually awarded.
 */
export async function completeLesson(
  db: Db,
  userId: string,
  lesson: { id: string; xp: number },
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.insert(lessonProgress).values({ userId, lessonId: lesson.id }).onConflictDoNothing();
    const awarded = await tx
      .insert(xpEvents)
      .values({ userId, amount: lesson.xp, reason: "lesson_complete", refId: lesson.id })
      .onConflictDoNothing()
      .returning({ amount: xpEvents.amount });
    return awarded[0]?.amount ?? 0;
  });
}

export async function getStats(db: Db, userId: string) {
  const [total] = await db
    .select({ xp: sql<number>`coalesce(sum(${xpEvents.amount}), 0)::int` })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId));

  const days = await db
    .selectDistinct({ day: sql<string>`(${xpEvents.createdAt} at time zone 'UTC')::date::text` })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId))
    .orderBy(desc(sql`1`))
    .limit(366);

  return { xp: total?.xp ?? 0, streak: streakFromDays(days.map((d) => d.day)) };
}

/** Consecutive UTC days with activity, ending today or yesterday. `days` sorted desc. */
export function streakFromDays(days: string[], today = new Date()): number {
  const dayMs = 86_400_000;
  const toDay = (d: Date) => Math.floor(d.getTime() / dayMs);
  let expected = toDay(today);
  let streak = 0;
  for (const [i, iso] of days.entries()) {
    const day = toDay(new Date(`${iso}T00:00:00Z`));
    if (i === 0 && day === expected - 1) expected--; // streak still alive if you haven't played today
    if (day !== expected) break;
    streak++;
    expected--;
  }
  return streak;
}
