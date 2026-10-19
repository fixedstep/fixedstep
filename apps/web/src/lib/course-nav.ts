import type { CourseOutline, LessonSummary } from "@fixedstep/content-schema";

export type LessonContext = {
  course: CourseOutline;
  chapter: CourseOutline["chapters"][number];
  next: LessonSummary | null;
  /** Every lesson in the chapter is done, counting `lessonId` as done. */
  chapterComplete: boolean;
  /** `next` starts a new chapter (or there is no next lesson). */
  endOfChapter: boolean;
};

/** Where a lesson sits in the course outlines, or null if it isn't in any of them. */
export function findLessonContext(
  courses: CourseOutline[],
  lessonId: string,
): LessonContext | null {
  for (const course of courses) {
    const flat = course.chapters.flatMap((chapter) => chapter.lessons.map((l) => ({ chapter, l })));
    const i = flat.findIndex((x) => x.l.id === lessonId);
    const entry = flat[i];
    if (!entry) continue;
    const { chapter } = entry;
    const nextEntry = flat[i + 1];
    return {
      course,
      chapter,
      next: nextEntry?.l ?? null,
      chapterComplete: chapter.lessons.every((l) => l.id === lessonId || l.completed),
      endOfChapter: !nextEntry || nextEntry.chapter !== chapter,
    };
  }
  return null;
}
