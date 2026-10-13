import { type Db, chapters, courses, lessons } from "@fixedstep/db";
import { and, eq, isNull, notInArray } from "drizzle-orm";
import type { LoadedCourse } from "./load";

/**
 * Upserts content by slug in one transaction. Lessons/chapters that disappeared from the
 * content repo are archived (not deleted) so learner progress and submissions survive.
 * Courses missing from this sync are left alone — sync is per course directory.
 */
export async function syncContent(db: Db, loaded: LoadedCourse[]) {
  const now = new Date();
  await db.transaction(async (tx) => {
    for (const c of loaded) {
      const [course] = await tx
        .insert(courses)
        .values({
          slug: c.slug,
          title: c.title,
          description: c.description,
          position: c.position,
          published: c.published,
        })
        .onConflictDoUpdate({
          target: courses.slug,
          set: {
            title: c.title,
            description: c.description,
            position: c.position,
            published: c.published,
            archivedAt: null,
          },
        })
        .returning({ id: courses.id });
      if (!course) throw new Error(`upsert failed for course ${c.slug}`);

      const keptChapterIds: string[] = [];
      for (const [chapterPos, ch] of c.chaptersLoaded.entries()) {
        const [chapter] = await tx
          .insert(chapters)
          .values({ courseId: course.id, slug: ch.slug, title: ch.title, position: chapterPos })
          .onConflictDoUpdate({
            target: [chapters.courseId, chapters.slug],
            set: { title: ch.title, position: chapterPos, archivedAt: null },
          })
          .returning({ id: chapters.id });
        if (!chapter) throw new Error(`upsert failed for chapter ${ch.slug}`);
        keptChapterIds.push(chapter.id);

        const keptLessonSlugs: string[] = [];
        for (const [lessonPos, l] of ch.lessonsLoaded.entries()) {
          const values = {
            title: l.title,
            kind: l.kind,
            access: l.access,
            xp: l.xp,
            position: lessonPos,
            bodyMd: l.bodyMd,
            starterCode: l.starterCode,
            visibleTests: l.visibleTests,
            hiddenTests: l.hiddenTests,
            solution: l.solution,
            quiz: l.quiz ?? null,
            contentHash: l.contentHash,
            archivedAt: null,
          };
          await tx
            .insert(lessons)
            .values({ chapterId: chapter.id, slug: l.slug, ...values })
            .onConflictDoUpdate({ target: [lessons.chapterId, lessons.slug], set: values });
          keptLessonSlugs.push(l.slug);
        }
        await tx
          .update(lessons)
          .set({ archivedAt: now })
          .where(
            and(
              eq(lessons.chapterId, chapter.id),
              notInArray(lessons.slug, keptLessonSlugs),
              isNull(lessons.archivedAt),
            ),
          );
      }
      await tx
        .update(chapters)
        .set({ archivedAt: now })
        .where(
          and(
            eq(chapters.courseId, course.id),
            notInArray(chapters.id, keptChapterIds),
            isNull(chapters.archivedAt),
          ),
        );
    }
  });
}
