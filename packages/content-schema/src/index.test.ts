import { describe, expect, it } from "vitest";
import { TestResult } from "./index";

describe("TestResult", () => {
  it("parses with and without a hint", () => {
    const base = { name: "n", passed: false, hidden: true };
    expect(TestResult.parse(base)).toEqual(base);
    expect(TestResult.parse({ ...base, hint: "h" })).toEqual({ ...base, hint: "h" });
  });

  it("rejects a non-string hint", () => {
    expect(TestResult.safeParse({ name: "n", passed: false, hidden: false, hint: 1 }).success).toBe(
      false,
    );
  });
});
