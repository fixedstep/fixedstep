import type { CourseOutline, CourseRating } from "@fixedstep/content-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatRating, withRating } from "../lib/rating";

const STARS = [1, 2, 3, 4, 5] as const;

/** Read-only average + count; `emptyText` (or nothing) below the minimum count. */
export function RatingSummary({ rating, emptyText }: { rating: CourseRating; emptyText?: string }) {
  const text = formatRating(rating);
  if (text === null || rating.average === null) {
    return emptyText ? <p className="rating-summary muted">{emptyText}</p> : null;
  }
  return (
    <p className="rating-summary">
      <span aria-hidden>{text}</span>
      <span className="sr-only">
        Rated {rating.average.toFixed(1)} out of 5 from {rating.count} ratings
      </span>
    </p>
  );
}

/**
 * Sets the caller's own rating. A fieldset of same-named native radios is the semantic
 * radiogroup and gives arrow-key, Tab and Space handling for free.
 */
export function StarRating({ course }: { course: CourseOutline }) {
  const rate = useRateCourse(course.slug);
  const mine = course.rating.mine;
  return (
    <fieldset className="star-rating">
      <legend className="sr-only">Your rating</legend>
      {STARS.map((n) => (
        <label key={n} className={mine !== null && n <= mine ? "filled" : undefined}>
          <input
            type="radio"
            className="sr-only"
            name={`rating-${course.slug}`}
            value={n}
            checked={mine === n}
            onChange={() => rate.mutate(n)}
          />
          <span aria-hidden>★</span>
          <span className="sr-only">Rate {n} out of 5</span>
        </label>
      ))}
      {rate.isError && (
        <span className="error" role="status">
          Couldn't save your rating. Try again.
        </span>
      )}
    </fieldset>
  );
}

/** PUTs the rating, updating the cached outline optimistically and rolling back on failure. */
function useRateCourse(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stars: number) => api.rateCourse(slug, stars),
    onMutate: async (stars) => {
      await qc.cancelQueries({ queryKey: ["courses"] });
      const prev = qc.getQueryData<CourseOutline[]>(["courses"]);
      const current = prev?.find((c) => c.slug === slug);
      if (prev && current) {
        qc.setQueryData(["courses"], withRating(prev, slug, { ...current.rating, mine: stars }));
      }
      return { prev };
    },
    onError: (_err, _stars, context) => {
      if (context?.prev) qc.setQueryData(["courses"], context.prev);
    },
    onSuccess: (rating) => {
      qc.setQueryData<CourseOutline[]>(["courses"], (courses) =>
        courses ? withRating(courses, slug, rating) : courses,
      );
    },
  });
}
