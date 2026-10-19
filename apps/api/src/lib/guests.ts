import { lessonProgress, type schema, session, submissions, user, xpEvents } from "@fixedstep/db";
import { and, eq, gt, lt, notExists, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Moves a guest's (anonymous user's) progress onto the account they signed up or signed in
 * with. Better Auth deletes the guest right after, and that cascade would take these rows
 * with it. Overlaps with the account keep one row per lesson: the earlier completion and
 * the larger XP award. XP events keep their timestamps, so streaks carry over.
 */
export async function mergeGuestProgress(db: AnyDb, fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      insert into ${lessonProgress} (user_id, lesson_id, completed_at)
      select ${toUserId}, lesson_id, completed_at from ${lessonProgress} where user_id = ${fromUserId}
      on conflict (user_id, lesson_id)
        do update set completed_at = least(${lessonProgress}.completed_at, excluded.completed_at)
    `);
    await tx.execute(sql`
      insert into ${xpEvents} (user_id, amount, reason, ref_id, created_at)
      select ${toUserId}, amount, reason, ref_id, created_at from ${xpEvents} where user_id = ${fromUserId}
      on conflict (user_id, reason, ref_id)
        do update set amount = greatest(${xpEvents}.amount, excluded.amount)
    `);
    await tx
      .update(submissions)
      .set({ userId: toUserId })
      .where(eq(submissions.userId, fromUserId));
  });
}

/**
 * Deletes guests who can never come back: no unexpired session, so no cookie can reach their
 * progress. The age check skips a guest whose session is still being created. Idempotent, so
 * it's safe to run on every API task. Returns how many were deleted.
 */
export async function deleteStaleGuests(db: AnyDb, now = new Date()): Promise<number> {
  const deleted = await db
    .delete(user)
    .where(
      and(
        eq(user.isAnonymous, true),
        lt(user.createdAt, new Date(now.getTime() - 60 * 60_000)),
        notExists(
          db
            .select({ one: sql`1` })
            .from(session)
            .where(and(eq(session.userId, user.id), gt(session.expiresAt, now))),
        ),
      ),
    )
    .returning({ id: user.id });
  return deleted.length;
}
