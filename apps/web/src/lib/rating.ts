import type { CourseOutline, CourseRating } from "@fixedstep/content-schema";
import type { Me } from "./api";

/** "4.2 ★ (17)", or null while the course has too few ratings for an average. */
export function formatRating(r: CourseRating): string | null {
  if (r.average === null) return null;
  return `${r.average.toFixed(1)} ★ (${r.count})`;
}

/**
 * What the rating UI should offer: the widget ("rate"), a sign-up nudge ("guest"), or nothing.
 * Mirrors the API rule (a non-guest with a completed lesson in the course); `justCompleted`
 * counts as done because the cached outline can lag a just-passed submission.
 */
export function rateAccess(
  me: Me | undefined,
  course: CourseOutline,
  justCompleted?: string,
): "rate" | "guest" | "none" {
  const user = me?.user;
  if (!user) return "none";
  const done = course.chapters.some((ch) =>
    ch.lessons.some((l) => l.completed || l.id === justCompleted),
  );
  if (!done) return "none";
  return user.isAnonymous ? "guest" : "rate";
}

export type RatingSaveState = "idle" | "saving" | "saved" | "error";

/** Text for the star widget's live status region; empty when there's nothing to say. */
export function ratingStatusText(state: RatingSaveState, stars: number | null): string {
  switch (state) {
    case "saving":
      return "Saving…";
    case "saved":
      return stars === null ? "Saved" : `Saved: you rated ${stars} out of 5`;
    case "error":
      return "Couldn't save your rating. Try again.";
    default:
      return "";
  }
}

/** `courses` with `slug`'s rating replaced, leaving the input untouched. */
export function withRating(
  courses: CourseOutline[],
  slug: string,
  rating: CourseRating,
): CourseOutline[] {
  return courses.map((c) => (c.slug === slug ? { ...c, rating } : c));
}
