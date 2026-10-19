import type { QuizQuestion } from "@fixedstep/content-schema";
import { describe, expect, it } from "vitest";
import { gradeQuiz } from "./quiz";

const questions: QuizQuestion[] = [
  { id: "a", prompt: "A?", options: ["x", "y"], answer: 1, explanation: "Because y." },
  { id: "b", prompt: "B?", options: ["x", "y", "z"], answer: 2 },
];

describe("gradeQuiz", () => {
  it("passes when every answer is right", () => {
    const { grade, feedback } = gradeQuiz(questions, { a: 1, b: 2 });
    expect(grade.status).toBe("passed");
    expect(feedback).toEqual([
      { id: "a", correct: true, explanation: "Because y." },
      { id: "b", correct: true },
    ]);
  });

  it("withholds explanations for wrong picks and treats missing answers as wrong", () => {
    const { grade, feedback } = gradeQuiz(questions, { a: 0 });
    expect(grade.status).toBe("failed");
    expect(feedback).toEqual([
      { id: "a", correct: false },
      { id: "b", correct: false },
    ]);
  });

  it("never includes the correct option index", () => {
    const out = JSON.stringify(gradeQuiz(questions, { a: 0, b: 0 }));
    expect(out).not.toContain("answer");
  });
});
