import { ApiError } from "./api";

/** What to tell the learner when a submit fails (401 is handled separately with a sign-in link). */
export function submitErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 503) {
    return "The grader is busy right now. Try again in a moment.";
  }
  return "Submission failed. Try again.";
}
