import {
  type CourseOutline,
  type CourseRating,
  RateCourseRequest,
  Slug,
} from "@fixedstep/content-schema";
import {
  chapters,
  courses,
  lessonProgress,
  lessons,
  courseRatings as ratingsTable,
} from "@fixedstep/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../context";
import { courseRatings, NO_RATING } from "../lib/ratings";

export function courseRoutes({ db }: Deps) {
  const r = new Hono<AppEnv>();

  r.get("/courses", async (c) => {
    const user = c.get("user");
    const rows = await db
      .select({
        courseId: courses.id,
        courseSlug: courses.slug,
        courseTitle: courses.title,
        courseDescription: courses.description,
        chapterSlug: chapters.slug,
        chapterTitle: chapters.title,
        lessonId: lessons.id,
        lessonSlug: lessons.slug,
        lessonTitle: lessons.title,
        kind: lessons.kind,
        access: lessons.access,
        xp: lessons.xp,
      })
      .from(courses)
      .innerJoin(chapters, and(eq(chapters.courseId, courses.id), isNull(chapters.archivedAt)))
      .innerJoin(lessons, and(eq(lessons.chapterId, chapters.id), isNull(lessons.archivedAt)))
      .where(and(eq(courses.published, true), isNull(courses.archivedAt)))
      .orderBy(asc(courses.position), asc(chapters.position), asc(lessons.position));

    const completed = new Set(
      user
        ? (
            await db
              .select({ lessonId: lessonProgress.lessonId })
              .from(lessonProgress)
              .where(eq(lessonProgress.userId, user.id))
          ).map((r) => r.lessonId)
        : [],
    );
    const ratings = await courseRatings(db, user?.id ?? null);

    const out: CourseOutline[] = [];
    for (const row of rows) {
      let course = out.at(-1);
      if (course?.slug !== row.courseSlug) {
        const rating = ratings.get(row.courseId) ?? NO_RATING;
        course = {
          slug: row.courseSlug,
          title: row.courseTitle,
          description: row.courseDescription,
          chapters: [],
          rating: { average: rating.average, count: rating.count, mine: rating.mine },
        };
        out.push(course);
      }
      let chapter = course.chapters.at(-1);
      if (chapter?.slug !== row.chapterSlug) {
        chapter = { slug: row.chapterSlug, title: row.chapterTitle, lessons: [] };
        course.chapters.push(chapter);
      }
      chapter.lessons.push({
        id: row.lessonId,
        slug: row.lessonSlug,
        title: row.lessonTitle,
        kind: row.kind,
        access: row.access,
        xp: row.xp,
        completed: completed.has(row.lessonId),
      });
    }
    return c.json(out);
  });

  r.put("/courses/:slug/rating", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "sign in to rate" }, 401);
    if (user.isAnonymous) return c.json({ error: "create an account to rate" }, 403);

    const slug = c.req.param("slug");
    const [course] = Slug.safeParse(slug).success
      ? await db
          .select({ id: courses.id })
          .from(courses)
          .where(
            and(eq(courses.slug, slug), eq(courses.published, true), isNull(courses.archivedAt)),
          )
          .limit(1)
      : [];
    if (!course) return c.json({ error: "not found" }, 404);

    const body = RateCourseRequest.safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: "stars must be an integer from 1 to 5" }, 400);

    // Archived lessons/chapters still count: earlier completions shouldn't be lost.
    const [done] = await db
      .select({ lessonId: lessonProgress.lessonId })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessons.id, lessonProgress.lessonId))
      .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
      .where(and(eq(lessonProgress.userId, user.id), eq(chapters.courseId, course.id)))
      .limit(1);
    if (!done) return c.json({ error: "complete a lesson first" }, 403);

    const { stars } = body.data;
    await db
      .insert(ratingsTable)
      .values({ userId: user.id, courseId: course.id, stars })
      // updatedAt is set explicitly: $onUpdate isn't relied on inside an upsert.
      .onConflictDoUpdate({
        target: [ratingsTable.userId, ratingsTable.courseId],
        set: { stars, updatedAt: new Date() },
      });

    const rating = (await courseRatings(db, user.id, [course.id])).get(course.id) ?? NO_RATING;
    return c.json({
      average: rating.average,
      count: rating.count,
      mine: rating.mine,
    } satisfies CourseRating);
  });

  return r;
}
