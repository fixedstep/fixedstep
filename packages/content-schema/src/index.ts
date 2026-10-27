import { z } from "zod";

/**
 * Content model shared by the private content repo (validated in its CI), the DB sync,
 * the API, and the web app. Changing these schemas is a contract change for the content repo.
 */

export const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slugs are lowercase-kebab-case");

export const LessonKind = z.enum(["reading", "quiz", "code", "sim"]);
export type LessonKind = z.infer<typeof LessonKind>;

export const Access = z.enum(["free", "paid"]);
export type Access = z.infer<typeof Access>;

/** courses/<course>/course.yaml */
export const CourseManifest = z.object({
  slug: Slug,
  title: z.string().min(1),
  description: z.string().min(1),
  position: z.number().int().nonnegative(),
  published: z.boolean().default(false),
  /** Chapter directory names, in order. */
  chapters: z.array(Slug).min(1),
});
export type CourseManifest = z.infer<typeof CourseManifest>;

/** courses/<course>/<chapter>/chapter.yaml */
export const ChapterManifest = z.object({
  slug: Slug,
  title: z.string().min(1),
  /** Lesson directory names, in order. */
  lessons: z.array(Slug).min(1),
});
export type ChapterManifest = z.infer<typeof ChapterManifest>;

/** A quiz question as authored. `answer` is server-only. */
export const QuizQuestion = z.object({
  id: Slug,
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  answer: z.number().int().nonnegative(),
  explanation: z.string().optional(),
});
export type QuizQuestion = z.infer<typeof QuizQuestion>;

/** Frontmatter of courses/<course>/<chapter>/<lesson>/lesson.md */
export const LessonFrontmatter = z
  .object({
    slug: Slug,
    title: z.string().min(1),
    kind: LessonKind,
    access: Access.default("paid"),
    xp: z.number().int().nonnegative().default(10),
    quiz: z.array(QuizQuestion).optional(),
  })
  .superRefine((lesson, ctx) => {
    if (lesson.kind === "quiz" && !lesson.quiz?.length) {
      ctx.addIssue({ code: "custom", message: "quiz lessons need at least one question" });
    }
    for (const q of lesson.quiz ?? []) {
      if (q.answer >= q.options.length) {
        ctx.addIssue({ code: "custom", message: `quiz ${q.id}: answer index out of range` });
      }
    }
  });
export type LessonFrontmatter = z.infer<typeof LessonFrontmatter>;

/**
 * Files that sit next to lesson.md for code/sim lessons:
 *   starter.ts       — what the student starts with (sent to the browser)
 *   tests.ts         — visible tests (sent to the browser, run on both sides)
 *   tests.hidden.ts  — optional, server-only
 *   solution.ts      — server-only; CI checks it passes every test
 *   hints.md         — optional, server-only; 1–MAX_HINTS hints separated by `---` lines,
 *                      unlocked one per failed submission and sent only once unlocked
 */
export const LESSON_FILES = {
  body: "lesson.md",
  starter: "starter.ts",
  visibleTests: "tests.ts",
  hiddenTests: "tests.hidden.ts",
  solution: "solution.ts",
  hints: "hints.md",
} as const;

export const MAX_HINTS = 4;

// ---------------------------------------------------------------------------
// API DTOs. Anything sent to the browser must be built from these, never from DB rows,
// so server-only fields (hidden tests, solutions, quiz answers) can't leak by accident.
// ---------------------------------------------------------------------------

export const PublicQuizQuestion = QuizQuestion.omit({ answer: true, explanation: true });
export type PublicQuizQuestion = z.infer<typeof PublicQuizQuestion>;

export const LessonSummary = z.object({
  id: z.string(),
  slug: Slug,
  title: z.string(),
  kind: LessonKind,
  access: Access,
  xp: z.number().int(),
  completed: z.boolean(),
});
export type LessonSummary = z.infer<typeof LessonSummary>;

export const CourseRating = z.object({
  /** Rounded to 1 decimal server-side; null below the minimum count. */
  average: z.number().nullable(),
  count: z.number().int(),
  /** The caller's own rating, if any. */
  mine: z.number().int().min(1).max(5).nullable(),
});
export type CourseRating = z.infer<typeof CourseRating>;

export const RateCourseRequest = z.object({ stars: z.number().int().min(1).max(5) });
export type RateCourseRequest = z.infer<typeof RateCourseRequest>;

export const CourseOutline = z.object({
  slug: Slug,
  title: z.string(),
  description: z.string(),
  chapters: z.array(z.object({ slug: Slug, title: z.string(), lessons: z.array(LessonSummary) })),
  rating: CourseRating,
});
export type CourseOutline = z.infer<typeof CourseOutline>;

/** Hint counts only, never the texts. Hint n unlocks after n failed submissions. */
export const HintStatus = z.object({ total: z.number().int(), unlocked: z.number().int() });
export type HintStatus = z.infer<typeof HintStatus>;

/** GET /lessons/:id/hints. `hints` holds only the unlocked ones (`hints.length === unlocked`). */
export const LessonHints = HintStatus.extend({ hints: z.array(z.string()) });
export type LessonHints = z.infer<typeof LessonHints>;

export const PublicLesson = z.object({
  id: z.string(),
  slug: Slug,
  title: z.string(),
  kind: LessonKind,
  access: Access,
  xp: z.number().int(),
  bodyMd: z.string(),
  starterCode: z.string().nullable(),
  visibleTests: z.string().nullable(),
  hasHiddenTests: z.boolean(),
  quiz: z.array(PublicQuizQuestion).nullable(),
  completed: z.boolean(),
  hintStatus: HintStatus,
});
export type PublicLesson = z.infer<typeof PublicLesson>;

/** Returned with HTTP 402 when a paid lesson is requested without an entitlement. */
export const LockedLesson = z.object({
  id: z.string(),
  title: z.string(),
  locked: z.literal(true),
});
export type LockedLesson = z.infer<typeof LockedLesson>;

export const SubmitRequest = z.union([
  z.object({ code: z.string().max(100_000) }),
  z.object({ answers: z.record(z.string(), z.number().int().nonnegative()) }),
]);
export type SubmitRequest = z.infer<typeof SubmitRequest>;

export const TestResult = z.object({
  name: z.string(),
  passed: z.boolean(),
  hidden: z.boolean(),
  /** Omitted for hidden tests so their inputs don't leak through error messages. */
  error: z.string().optional(),
  /** Author-written "usual mistake"; only on failed tests. Sent for hidden tests too (unlike error). */
  hint: z.string().optional(),
});
export type TestResult = z.infer<typeof TestResult>;

export const GradeResult = z.object({
  status: z.enum(["passed", "failed", "error"]),
  results: z.array(TestResult),
  /** Compile errors, timeouts, top-level exceptions. */
  error: z.string().optional(),
  durationMs: z.number(),
});
export type GradeResult = z.infer<typeof GradeResult>;

/** Per-question quiz feedback. The correct option is never sent, only whether the pick was right. */
export const QuizFeedback = z.object({
  id: Slug,
  correct: z.boolean(),
  /** Only for correct picks, since an explanation can give the answer away. */
  explanation: z.string().optional(),
});
export type QuizFeedback = z.infer<typeof QuizFeedback>;

export const SubmitResponse = z.object({
  grade: GradeResult,
  xpAwarded: z.number().int(),
  completed: z.boolean(),
  /** Day streak after this submission; only set when it passed. */
  streak: z.number().int().optional(),
  /** Set for quiz lessons. */
  quiz: z.array(QuizFeedback).optional(),
  /** After counting this submission; `{ total: 0, unlocked: 0 }` for lessons without hints. */
  hintStatus: HintStatus,
});
export type SubmitResponse = z.infer<typeof SubmitResponse>;
