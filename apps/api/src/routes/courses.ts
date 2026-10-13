import type { CourseOutline } from "@fixedstep/content-schema";
import { chapters, courses, lessonProgress, lessons } from "@fixedstep/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../context";

export function courseRoutes({ db }: Deps) {
  const r = new Hono<AppEnv>();

  r.get("/courses", async (c) => {
    const user = c.get("user");
    const rows = await db
      .select({
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

    const out: CourseOutline[] = [];
    for (const row of rows) {
      let course = out.at(-1);
      if (course?.slug !== row.courseSlug) {
        course = {
          slug: row.courseSlug,
          title: row.courseTitle,
          description: row.courseDescription,
          chapters: [],
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

  return r;
}
