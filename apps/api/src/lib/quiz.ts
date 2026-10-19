import type { GradeResult, QuizFeedback, QuizQuestion } from "@fixedstep/content-schema";

/** Grades quiz answers. Unanswered questions count as wrong. Never returns `answer`. */
export function gradeQuiz(
  questions: QuizQuestion[],
  answers: Record<string, number>,
): { grade: GradeResult; feedback: QuizFeedback[] } {
  const feedback = questions.map((q): QuizFeedback => {
    const correct = answers[q.id] === q.answer;
    return correct && q.explanation
      ? { id: q.id, correct, explanation: q.explanation }
      : { id: q.id, correct };
  });
  const results = feedback.map((f) => ({ name: f.id, passed: f.correct, hidden: false }));
  return {
    grade: {
      status: results.every((r) => r.passed) ? "passed" : "failed",
      results,
      durationMs: 0,
    },
    feedback,
  };
}
