import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../lib/api";
import { findLessonContext } from "../lib/course-nav";
import { rateAccess } from "../lib/rating";
import { StarRating } from "./StarRating";

export function CompletionCard({
  lessonId,
  xpAwarded,
  streak,
  prevStreak,
}: {
  lessonId: string;
  xpAwarded: number;
  streak?: number;
  prevStreak?: number;
}) {
  const courses = useQuery({ queryKey: ["courses"], queryFn: api.courses });
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const ctx = courses.data ? findLessonContext(courses.data, lessonId) : null;
  const streakUp = streak !== undefined && prevStreak !== undefined && streak > prevStreak;
  const chapterDone = ctx?.endOfChapter && ctx.chapterComplete;

  // The live region covers the lesson result only. The rating widget has its own status
  // region, and nesting it in this one could announce each save twice.
  return (
    <section className="completion">
      <div className="completion-body" aria-live="polite">
        <div className="completion-head">
          <h3>{chapterDone ? `Chapter complete: ${ctx.chapter.title}` : "Lesson complete"}</h3>
          <div className="completion-stats">
            {xpAwarded > 0 && <span className="xp-gain">+{xpAwarded} XP</span>}
            {streak !== undefined && streak > 0 && (
              <span className={streakUp ? "streak-up" : undefined}>
                🔥 {streak} day streak{streakUp && " ↑"}
              </span>
            )}
          </div>
        </div>
        {ctx?.next ? (
          <Link
            to="/lessons/$lessonId"
            params={{ lessonId: ctx.next.id }}
            className="button primary"
          >
            Next{ctx.endOfChapter ? " chapter" : ""}: {ctx.next.title} →
          </Link>
        ) : (
          ctx && (
            <p className="muted">
              That's the end of {ctx.course.title}. <Link to="/">Back to courses</Link>
            </p>
          )
        )}
      </div>
      {ctx && !ctx.next && rateAccess(me.data, ctx.course, lessonId) === "rate" && (
        <div className="completion-rate">
          <strong>Rate {ctx.course.title}</strong>
          <StarRating course={ctx.course} />
        </div>
      )}
    </section>
  );
}
