import { expect, it } from "vitest";
import { ApiError } from "./api";
import { submitErrorMessage } from "./submit-error";

it("tells the learner the grader is busy on a 503", () => {
  expect(submitErrorMessage(new ApiError(503, { error: "busy" }))).toMatch(/grader is busy/);
});

it("falls back to the generic message otherwise", () => {
  expect(submitErrorMessage(new ApiError(500, null))).toBe("Submission failed. Try again.");
  expect(submitErrorMessage(new Error("network"))).toBe("Submission failed. Try again.");
});
