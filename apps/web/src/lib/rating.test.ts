import type { CourseOutline, LessonSummary } from "@fixedstep/content-schema";
import { describe, expect, it } from "vitest";
import type { Me } from "./api";
import { formatRating, rateAccess, withRating } from "./rating";

const lesson = (id: string, completed = false): LessonSummary => ({
  id,
  slug: id,
  title: id,
  kind: "reading",
  access: "free",
  xp: 10,
  completed,
});

const course = (slug: string, completed = false): CourseOutline => ({
  slug,
  title: slug,
  description: "",
  chapters: [{ slug: "one", title: "One", lessons: [lesson(`${slug}-a`, completed)] }],
  rating: { average: null, count: 0, mine: null },
});

const me = (isAnonymous: boolean): Me => ({
  user: { id: "u", name: "U", email: "u@test.dev", image: null, isAnonymous },
  xp: 0,
  streak: 0,
  pro: false,
});

describe("formatRating", () => {
  it("is null below the threshold", () => {
    expect(formatRating({ average: null, count: 2, mine: null })).toBeNull();
  });

  it("shows one decimal and the count", () => {
    expect(formatRating({ average: 4.3, count: 3, mine: null })).toBe("4.3 ★ (3)");
    expect(formatRating({ average: 4, count: 3, mine: 4 })).toBe("4.0 ★ (3)");
    expect(formatRating({ average: 5, count: 120, mine: null })).toBe("5.0 ★ (120)");
  });
});

describe("rateAccess", () => {
  it("is none when signed out", () => {
    expect(rateAccess(undefined, course("c", true))).toBe("none");
    // me is undefined while the query loads, even if the course is already completed
    expect(rateAccess(undefined, course("c"), "c-a")).toBe("none");
    expect(rateAccess({ ...me(false), user: null }, course("c", true))).toBe("none");
  });

  it("nudges a guest with progress", () => {
    expect(rateAccess(me(true), course("c", true))).toBe("guest");
    expect(rateAccess(me(true), course("c"))).toBe("none");
  });

  it("needs a completed lesson for a member", () => {
    expect(rateAccess(me(false), course("c"))).toBe("none");
    expect(rateAccess(me(false), course("c", true))).toBe("rate");
  });

  it("counts the lesson just completed", () => {
    expect(rateAccess(me(false), course("c"), "c-a")).toBe("rate");
    expect(rateAccess(me(false), course("c"), "other")).toBe("none");
  });
});

describe("withRating", () => {
  it("replaces only the matching course", () => {
    const courses = [course("a"), course("b")];
    const rating = { average: 4.5, count: 4, mine: 5 };
    const out = withRating(courses, "a", rating);
    expect(out[0]?.rating).toEqual(rating);
    expect(out[1]).toBe(courses[1]);
    expect(courses[0]?.rating).toEqual({ average: null, count: 0, mine: null });
  });

  it("returns a new array and new object for the replaced course", () => {
    const courses = [course("a"), course("b")];
    const out = withRating(courses, "a", { average: 4.5, count: 4, mine: 5 });
    expect(out).not.toBe(courses);
    expect(out[0]).not.toBe(courses[0]);
    expect(out[0]?.chapters).toBe(courses[0]?.chapters);
  });

  it("returns an equal copy when the slug is unknown", () => {
    const courses = [course("a")];
    const out = withRating(courses, "zzz", { average: 1, count: 3, mine: 1 });
    expect(out).not.toBe(courses);
    expect(out).toEqual(courses);
  });
});
