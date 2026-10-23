import type { CourseRating } from "@fixedstep/content-schema";
import { type Db, courseRatings as ratingsTable } from "@fixedstep/db";
import { inArray, sql } from "drizzle-orm";

/** Below this many ratings a course shows a count but no average. */
export const MIN_RATINGS_TO_SHOW = 3;

export const NO_RATING: CourseRating = { average: null, count: 0, mine: null };

/** Rating aggregates per course id, in one grouped query. `mine` is `userId`'s own rating. */
export async function courseRatings(
  db: Db,
  userId: string | null,
  courseIds?: string[],
): Promise<Map<string, CourseRating>> {
  const isMine = sql`${ratingsTable.userId} = ${userId}`;
  const mine = userId
    ? sql<number | null>`max(${ratingsTable.stars}) filter (where ${isMine})`
    : sql<null>`null`;
  const rows = await db
    .select({
      courseId: ratingsTable.courseId,
      count: sql<number>`count(*)::int`,
      average: sql<number>`round(avg(${ratingsTable.stars})::numeric, 1)`.mapWith(Number),
      mine,
    })
    .from(ratingsTable)
    .where(courseIds ? inArray(ratingsTable.courseId, courseIds) : undefined)
    .groupBy(ratingsTable.courseId);

  return new Map(
    rows.map((row) => [
      row.courseId,
      {
        average: row.count >= MIN_RATINGS_TO_SHOW ? row.average : null,
        count: row.count,
        mine: row.mine,
      },
    ]),
  );
}
