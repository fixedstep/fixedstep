import type { CourseOutline, LessonSummary } from "@fixedstep/content-schema";
import type { AnalyticsEvent } from "./analytics";

export type LessonContext = {
  course: CourseOutline;
  chapter: CourseOutline["chapters"][number];
  lesson: LessonSummary;
  prev: LessonSummary | null;
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
      lesson: entry.l,
      prev: flat[i - 1]?.l ?? null,
      next: nextEntry?.l ?? null,
      chapterComplete: chapter.lessons.every((l) => l.id === lessonId || l.completed),
      endOfChapter: !nextEntry || nextEntry.chapter !== chapter,
    };
  }
  return null;
}

/**
 * Analytics events for a lesson that was just completed, from the `["courses"]` outline as it
 * was *before* the submit refetched it. Empty if the lesson was already done or isn't in the
 * outline. `course_started` is the course's first completed lesson.
 */
export function completionEvents(courses: CourseOutline[], lessonId: string): AnalyticsEvent[] {
  const ctx = findLessonContext(courses, lessonId);
  if (!ctx || ctx.lesson.completed) return [];
  const events: AnalyticsEvent[] = [];
  const course = ctx.course.slug;
  if (!ctx.course.chapters.some((c) => c.lessons.some((l) => l.completed))) {
    events.push({ name: "course_started", course });
  }
  events.push({ name: "lesson_completed", course, lessonId, kind: ctx.lesson.kind });
  return events;
}
