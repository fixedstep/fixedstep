import type { GradeResult, SubmitResponse } from "@fixedstep/content-schema";
import { describe, expect, it } from "vitest";
import { NO_HINTS, withHintStatus } from "./api";

describe("withHintStatus", () => {
  const grade: GradeResult = { status: "failed", results: [], durationMs: 1 };

  it("treats a missing hintStatus (older API) as no hints", () => {
    const res = withHintStatus<SubmitResponse>({ grade, xpAwarded: 0, completed: false });
    expect(res.hintStatus).toEqual(NO_HINTS);
    expect(res.grade).toBe(grade);
  });

  it("keeps the hintStatus the API sent", () => {
    const hintStatus = { total: 3, unlocked: 1 };
    const res = withHintStatus<SubmitResponse>({
      grade,
      xpAwarded: 0,
      completed: false,
      hintStatus,
    });
    expect(res.hintStatus).toEqual(hintStatus);
  });
});
