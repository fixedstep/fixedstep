import type { CourseOutline, LessonSummary } from "@fixedstep/content-schema";
import { describe, expect, it } from "vitest";
import { findLessonContext } from "./course-nav";

const lesson = (id: string, completed = false): LessonSummary => ({
  id,
  slug: id,
  title: id,
  kind: "reading",
  access: "free",
  xp: 10,
  completed,
});

const course: CourseOutline = {
  slug: "c",
  title: "C",
  description: "",
  chapters: [
    { slug: "one", title: "One", lessons: [lesson("a", true), lesson("b")] },
    { slug: "two", title: "Two", lessons: [lesson("c")] },
  ],
  rating: { average: null, count: 0, mine: null },
};

describe("findLessonContext", () => {
  it("finds the next lesson within a chapter", () => {
    const ctx = findLessonContext([course], "a");
    expect(ctx?.lesson.id).toBe("a");
    expect(ctx?.prev).toBeNull();
    expect(ctx?.next?.id).toBe("b");
    expect(ctx?.endOfChapter).toBe(false);
    expect(ctx?.chapterComplete).toBe(false);
  });

  it("crosses into the next chapter and counts the current lesson as done", () => {
    const ctx = findLessonContext([course], "b");
    expect(ctx?.prev?.id).toBe("a");
    expect(ctx?.next?.id).toBe("c");
    expect(ctx?.endOfChapter).toBe(true);
    expect(ctx?.chapterComplete).toBe(true);
  });

  it("has no next lesson at the end of the course", () => {
    expect(findLessonContext([course], "c")?.next).toBeNull();
  });

  it("returns null for unknown lessons", () => {
    expect(findLessonContext([course], "zzz")).toBeNull();
  });
});
