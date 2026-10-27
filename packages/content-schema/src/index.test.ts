import { describe, expect, it } from "vitest";
import { HintStatus, LessonHints, PublicLesson, TestResult } from "./index";

describe("hints DTOs", () => {
  it("parses HintStatus and LessonHints", () => {
    expect(HintStatus.parse({ total: 3, unlocked: 1 })).toEqual({ total: 3, unlocked: 1 });
    const hints = { total: 3, unlocked: 1, hints: ["nudge"] };
    expect(LessonHints.parse(hints)).toEqual(hints);
    expect(LessonHints.safeParse({ total: 3, unlocked: 1 }).success).toBe(false);
    expect(HintStatus.safeParse({ total: 1.5, unlocked: 0 }).success).toBe(false);
  });

  it("requires hintStatus on PublicLesson", () => {
    const lesson = {
      id: "l",
      slug: "l",
      title: "L",
      kind: "code",
      access: "free",
      xp: 10,
      bodyMd: "",
      starterCode: null,
      visibleTests: null,
      hasHiddenTests: false,
      quiz: null,
      completed: false,
    };
    expect(PublicLesson.safeParse(lesson).success).toBe(false);
    expect(
      PublicLesson.safeParse({ ...lesson, hintStatus: { total: 0, unlocked: 0 } }).success,
    ).toBe(true);
  });
});

describe("TestResult", () => {
  it("parses with and without a hint", () => {
    const base = { name: "n", passed: false, hidden: true };
    expect(TestResult.parse(base)).toEqual(base);
    expect(TestResult.parse({ ...base, hint: "h" })).toEqual({ ...base, hint: "h" });
  });

  it("rejects a non-string hint", () => {
    expect(TestResult.safeParse({ name: "n", passed: false, hidden: false, hint: 1 }).success).toBe(
      false,
    );
  });
});
