import type { CourseMetrics, LessonMetrics } from "@fixedstep/content-schema";
import {
  chapters,
  courseRatings,
  courses,
  type Db,
  lessonProgress,
  lessons,
  submissions,
} from "@fixedstep/db";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

/**
 * Per-lesson and per-course learning aggregates for admins, computed from existing tables and
 * counting every user, guests included (stale guests are swept by `deleteStaleGuests`, which
 * cascades, so guest-only activity eventually drops out of the numbers). Archived courses,
 * chapters and lessons are excluded. Output is built field-by-field from counts: lesson
 * content (`hiddenTests`, `solution`, `quiz`, hint texts) is never selected, only
 * `cardinality(hints)`.
 */
export async function courseMetrics(
  db: Db,
  opts: { courseSlug?: string } = {},
): Promise<CourseMetrics[]> {
  const structure = await db
    .select({
      courseId: courses.id,
      courseSlug: courses.slug,
      courseTitle: courses.title,
      published: courses.published,
      chapterSlug: chapters.slug,
      lessonId: lessons.id,
      lessonSlug: lessons.slug,
      lessonTitle: lessons.title,
      kind: lessons.kind,
      hintsAvailable: sql<number>`cardinality(${lessons.hints})::int`,
    })
    .from(courses)
    .innerJoin(chapters, and(eq(chapters.courseId, courses.id), isNull(chapters.archivedAt)))
    .innerJoin(lessons, and(eq(lessons.chapterId, chapters.id), isNull(lessons.archivedAt)))
    .where(
      and(
        isNull(courses.archivedAt),
        opts.courseSlug ? eq(courses.slug, opts.courseSlug) : undefined,
      ),
    )
    .orderBy(asc(courses.position), asc(chapters.position), asc(lessons.position));

  // Per (lesson, user): submissions, failures, and the attempt number of the first pass.
  const ranked = db
    .select({
      lessonId: submissions.lessonId,
      userId: submissions.userId,
      status: submissions.status,
      rn: sql<number>`row_number() over (partition by ${submissions.lessonId}, ${submissions.userId} order by ${submissions.createdAt}, ${submissions.id})`.as(
        "rn",
      ),
    })
    .from(submissions)
    .as("ranked");
  const attempts = await db
    .select({
      lessonId: ranked.lessonId,
      userId: ranked.userId,
      failures: sql<number>`count(*) filter (where ${ranked.status} in ('failed', 'error'))::int`,
      attemptsToPass: sql<
        number | null
      >`min(${ranked.rn}) filter (where ${ranked.status} = 'passed')`,
    })
    .from(ranked)
    .groupBy(ranked.lessonId, ranked.userId);

  const progress = await db
    .select({ lessonId: lessonProgress.lessonId, userId: lessonProgress.userId })
    .from(lessonProgress);

  const ratings = await db
    .select({
      courseId: courseRatings.courseId,
      count: sql<number>`count(*)::int`,
      average: sql<number>`round(avg(${courseRatings.stars})::numeric, 2)`.mapWith(Number),
    })
    .from(courseRatings)
    .groupBy(courseRatings.courseId);
  const ratingByCourse = new Map(ratings.map((r) => [r.courseId, r]));

  const startedBy = new Map<string, Map<string, (typeof attempts)[number]>>();
  for (const a of attempts) {
    const users = startedBy.get(a.lessonId) ?? new Map<string, (typeof attempts)[number]>();
    users.set(a.userId, a);
    startedBy.set(a.lessonId, users);
  }
  const completedBy = new Map<string, Set<string>>();
  for (const p of progress) {
    const users = completedBy.get(p.lessonId) ?? new Set<string>();
    users.add(p.userId);
    completedBy.set(p.lessonId, users);
  }

  const byCourse = new Map<string, typeof structure>();
  for (const row of structure) {
    const rows = byCourse.get(row.courseId);
    if (rows) rows.push(row);
    else byCourse.set(row.courseId, [row]);
  }

  const out: CourseMetrics[] = [];
  for (const rows of byCourse.values()) {
    const first = rows[0];
    if (!first) continue;
    const learners = new Set<string>();
    // Users who completed every lesson so far; starts as the first lesson's completers.
    let completers = new Set<string>();
    const lessonMetrics: LessonMetrics[] = [];

    for (const [i, row] of rows.entries()) {
      const started = startedBy.get(row.lessonId) ?? new Map<string, (typeof attempts)[number]>();
      const done = completedBy.get(row.lessonId) ?? new Set<string>();
      for (const userId of started.keys()) learners.add(userId);
      for (const userId of done) learners.add(userId);
      completers = i === 0 ? new Set(done) : new Set([...completers].filter((u) => done.has(u)));

      let hintUnlocks = 0;
      let learnersWithHints = 0;
      const passes: number[] = [];
      for (const a of started.values()) {
        const unlocked = Math.min(row.hintsAvailable, a.failures);
        hintUnlocks += unlocked;
        if (unlocked > 0) learnersWithHints++;
        if (a.attemptsToPass !== null) passes.push(Number(a.attemptsToPass));
      }

      let dropOffFromPrev: number | null = null;
      const prev = rows[i - 1];
      if (prev) {
        const prevDone = completedBy.get(prev.lessonId) ?? new Set<string>();
        if (prevDone.size > 0) {
          let continued = 0;
          for (const userId of prevDone) if (started.has(userId)) continued++;
          dropOffFromPrev = 1 - continued / prevDone.size;
        }
      }

      lessonMetrics.push({
        lessonId: row.lessonId,
        slug: row.lessonSlug,
        title: row.lessonTitle,
        kind: row.kind,
        chapterSlug: row.chapterSlug,
        starts: started.size,
        completions: done.size,
        medianAttemptsToPass: median(passes),
        hintsAvailable: row.hintsAvailable,
        learnersWithHints,
        hintUnlocks,
        dropOffFromPrev,
      });
    }

    const rating = ratingByCourse.get(first.courseId);
    out.push({
      slug: first.courseSlug,
      title: first.courseTitle,
      published: first.published,
      learners: learners.size,
      completers: completers.size,
      completionRate: learners.size > 0 ? completers.size / learners.size : null,
      rating: { average: rating?.average ?? null, count: rating?.count ?? 0 },
      lessons: lessonMetrics,
    });
  }
  return out;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const hi = sorted[mid] as number;
  return sorted.length % 2 ? hi : ((sorted[mid - 1] as number) + hi) / 2;
}
