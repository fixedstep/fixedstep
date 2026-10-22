import {
  type GradeResult,
  type LockedLesson,
  type PublicLesson,
  type QuizFeedback,
  SubmitRequest,
  type SubmitResponse,
} from "@fixedstep/content-schema";
import { chapters, courses, lessonProgress, lessons, submissions } from "@fixedstep/db";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, clientKey, type Deps } from "../context";
import { hasPro } from "../lib/entitlements";
import { GraderBusyError } from "../lib/grader";
import { completeLesson, getStats } from "../lib/progress";
import { gradeQuiz } from "../lib/quiz";
import { createRateLimiter } from "../lib/rate-limit";

const LessonId = z.uuid();

export function lessonRoutes({ db, grader }: Deps) {
  const r = new Hono<AppEnv>();
  // Anti-scrape: generous for humans, slow for bulk downloaders.
  const readLimit = createRateLimiter({ limit: 60, windowMs: 60_000 });
  const submitLimit = createRateLimiter({ limit: 20, windowMs: 60_000 });

  async function findLesson(id: string) {
    if (!LessonId.safeParse(id).success) return undefined;
    const [row] = await db
      .select({ lesson: lessons })
      .from(lessons)
      .innerJoin(chapters, eq(chapters.id, lessons.chapterId))
      .innerJoin(courses, eq(courses.id, chapters.courseId))
      .where(
        and(
          eq(lessons.id, id),
          isNull(lessons.archivedAt),
          isNull(chapters.archivedAt),
          isNull(courses.archivedAt),
          eq(courses.published, true),
        ),
      )
      .limit(1);
    return row?.lesson;
  }

  r.get("/lessons/:id", async (c) => {
    const user = c.get("user");
    if (!readLimit(clientKey(user, c.req.raw.headers))) return c.json({ error: "slow down" }, 429);

    const lesson = await findLesson(c.req.param("id"));
    if (!lesson) return c.json({ error: "not found" }, 404);

    if (lesson.access === "paid" && !(await hasPro(db, user?.id))) {
      return c.json(
        { id: lesson.id, title: lesson.title, locked: true } satisfies LockedLesson,
        402,
      );
    }

    const completed = user
      ? (
          await db
            .select({ lessonId: lessonProgress.lessonId })
            .from(lessonProgress)
            .where(and(eq(lessonProgress.userId, user.id), eq(lessonProgress.lessonId, lesson.id)))
        ).length > 0
      : false;

    // Built field-by-field: hidden tests, solution and quiz answers must never be spread in.
    const body: PublicLesson = {
      id: lesson.id,
      slug: lesson.slug,
      title: lesson.title,
      kind: lesson.kind,
      access: lesson.access,
      xp: lesson.xp,
      bodyMd: lesson.bodyMd,
      starterCode: lesson.starterCode,
      visibleTests: lesson.visibleTests,
      hasHiddenTests: Boolean(lesson.hiddenTests),
      quiz: lesson.quiz?.map(({ id, prompt, options }) => ({ id, prompt, options })) ?? null,
      completed,
    };
    return c.json(body);
  });

  r.post("/lessons/:id/submit", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "sign in to submit" }, 401);
    if (!submitLimit(clientKey(user, c.req.raw.headers)))
      return c.json({ error: "slow down" }, 429);

    const lesson = await findLesson(c.req.param("id"));
    if (!lesson) return c.json({ error: "not found" }, 404);
    if (lesson.access === "paid" && !(await hasPro(db, user.id))) {
      return c.json({ error: "subscription required" }, 402);
    }

    const parsed = SubmitRequest.safeParse(await c.req.json().catch(() => ({})));
    let grade: GradeResult;
    let code: string | null = null;
    let answers: Record<string, number> | null = null;
    let quiz: QuizFeedback[] | undefined;

    if (lesson.kind === "reading") {
      grade = { status: "passed", results: [], durationMs: 0 };
    } else if (lesson.kind === "quiz") {
      if (!parsed.success || !("answers" in parsed.data))
        return c.json({ error: "answers required" }, 400);
      answers = parsed.data.answers;
      ({ grade, feedback: quiz } = gradeQuiz(lesson.quiz ?? [], answers));
    } else {
      if (!parsed.success || !("code" in parsed.data))
        return c.json({ error: "code required" }, 400);
      code = parsed.data.code;
      try {
        grade = await grader({
          code,
          visibleTests: lesson.visibleTests ?? "",
          hiddenTests: lesson.hiddenTests,
          seed: Math.floor(Math.random() * 2 ** 31),
        });
      } catch (e) {
        // Nothing was graded, so no submission row and no XP.
        if (e instanceof GraderBusyError) {
          // Also what a wrong GRADER_URL or a down grader looks like, so keep the cause visible.
          console.warn("[grader] busy:", e.message);
          return c.json({ error: "Grader is busy, try again in a moment" }, 503, {
            "retry-after": "5",
          });
        }
        throw e;
      }
    }

    await db.insert(submissions).values({
      userId: user.id,
      lessonId: lesson.id,
      code,
      answers,
      contentHash: lesson.contentHash,
      status: grade.status,
      result: grade,
    });

    const passed = grade.status === "passed";
    const xpAwarded = passed ? await completeLesson(db, user.id, lesson) : 0;
    const streak = passed ? (await getStats(db, user.id)).streak : undefined;
    return c.json({ grade, xpAwarded, completed: passed, streak, quiz } satisfies SubmitResponse);
  });

  return r;
}
