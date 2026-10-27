import type { HintStatus } from "@fixedstep/content-schema";
import { type Db, submissions } from "@fixedstep/db";
import { and, eq, inArray, sql } from "drizzle-orm";

/**
 * Hint n unlocks after n failed (`failed` or `error`) submissions by this user for this lesson,
 * counted from server-graded submission rows. Passing never resets the count. Counts only;
 * the hint texts are sent by GET /lessons/:id/hints.
 */
export async function hintStatus(
  db: Db,
  userId: string | undefined,
  lesson: { id: string; hints: string[] },
): Promise<HintStatus> {
  const total = lesson.hints.length;
  if (total === 0 || !userId) return { total, unlocked: 0 };
  const [row] = await db
    .select({ failures: sql<number>`count(*)::int` })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, userId),
        eq(submissions.lessonId, lesson.id),
        inArray(submissions.status, ["failed", "error"]),
      ),
    );
  return { total, unlocked: Math.min(total, row?.failures ?? 0) };
}
