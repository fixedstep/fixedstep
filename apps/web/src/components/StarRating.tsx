import type { CourseOutline, CourseRating } from "@fixedstep/content-schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { formatRating, type RatingSaveState, ratingStatusText, withRating } from "../lib/rating";

const STARS = [1, 2, 3, 4, 5] as const;
const SAVE_DELAY_MS = 500;
const SAVED_CLEAR_MS = 3000;

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
 *
 * Keyboard changes are debounced so stepping through the stars sends one PUT; a pointer click,
 * Enter, or focus leaving the fieldset sends at once. Until the PUT goes out the choice lives
 * only in `shown`, so a failed save rolls the cache back to the last saved rating.
 */
export function StarRating({ course }: { course: CourseOutline }) {
  const rate = useRateCourse(course.slug);
  const { mutate, reset } = rate;
  const [shown, setShown] = useState<number | null>(null);
  const unsent = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointer = useRef(false);
  const mine = shown ?? course.rating.mine;

  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    if (!rate.isSuccess) return;
    const t = setTimeout(reset, SAVED_CLEAR_MS);
    return () => clearTimeout(t);
  }, [rate.isSuccess, reset]);

  function send() {
    clearTimeout(timer.current);
    timer.current = undefined;
    const n = unsent.current;
    if (n === null) return;
    unsent.current = null;
    // Per-call callbacks only fire for the latest mutate, which is the one `shown` tracks.
    mutate(n, {
      onSettled: () => {
        if (unsent.current === null) setShown(null);
      },
    });
  }

  function change(n: number) {
    unsent.current = n;
    setShown(n);
    clearTimeout(timer.current);
    if (pointer.current) {
      pointer.current = false;
      send();
    } else {
      timer.current = setTimeout(send, SAVE_DELAY_MS);
    }
  }

  // An unsent change hides a stale "Saved"/error message from the previous save.
  const state: RatingSaveState = rate.isPending
    ? "saving"
    : shown !== null
      ? "idle"
      : rate.isError
        ? "error"
        : rate.isSuccess
          ? "saved"
          : "idle";

  return (
    <fieldset
      className="star-rating"
      onPointerDown={() => {
        pointer.current = true;
      }}
      onKeyDown={(e) => {
        pointer.current = false;
        if (e.key === "Enter") {
          // Commit now; don't submit a surrounding form. Focus stays on the radio.
          e.preventDefault();
          send();
        }
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) send();
      }}
    >
      <legend className="sr-only">Your rating</legend>
      {STARS.map((n) => (
        <label key={n} className={mine !== null && n <= mine ? "filled" : undefined}>
          <input
            type="radio"
            className="sr-only"
            name={`rating-${course.slug}`}
            value={n}
            checked={mine === n}
            onChange={() => change(n)}
          />
          <span aria-hidden>★</span>
          <span className="sr-only">Rate {n} out of 5</span>
        </label>
      ))}
      {/* Always rendered so the live region exists before its text changes, and its space is reserved. */}
      <span className={state === "error" ? "rating-status error" : "rating-status"} role="status">
        {ratingStatusText(state, rate.variables ?? null)}
      </span>
    </fieldset>
  );
}

/**
 * PUTs the rating, updating the cached outline optimistically and rolling back only this
 * course's rating on failure. Always refetches afterwards: `cancelQueries` may have cancelled
 * another refetch (e.g. the one after a passing submit), and a rollback can be stale.
 */
function useRateCourse(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stars: number) => api.rateCourse(slug, stars),
    onMutate: async (stars) => {
      await qc.cancelQueries({ queryKey: ["courses"] });
      const prev = qc.getQueryData<CourseOutline[]>(["courses"]);
      const prevRating = prev?.find((c) => c.slug === slug)?.rating;
      if (prev && prevRating) {
        qc.setQueryData(["courses"], withRating(prev, slug, { ...prevRating, mine: stars }));
      }
      return { prevRating };
    },
    onError: (_err, _stars, context) => {
      const prevRating = context?.prevRating;
      if (!prevRating) return;
      qc.setQueryData<CourseOutline[]>(["courses"], (courses) =>
        courses ? withRating(courses, slug, prevRating) : courses,
      );
    },
    onSuccess: (rating) => {
      qc.setQueryData<CourseOutline[]>(["courses"], (courses) =>
        courses ? withRating(courses, slug, rating) : courses,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}
