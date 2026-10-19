import { describe, expect, it } from "vitest";
import { isSafeRedirect, withUpgrade } from "./redirect";

describe("isSafeRedirect", () => {
  it("allows same-origin paths only", () => {
    expect(isSafeRedirect("/lessons/abc?x=1#y")).toBe(true);
    expect(isSafeRedirect("//evil.example")).toBe(false);
    expect(isSafeRedirect("/\\evil.example")).toBe(false);
    expect(isSafeRedirect("https://evil.example")).toBe(false);
  });
});

describe("withUpgrade", () => {
  it("adds the upgrade marker and keeps the hash", () => {
    expect(withUpgrade("/#pricing", "year")).toBe("/?upgrade=year#pricing");
    expect(withUpgrade("/lessons/a?upgrade=month", "year")).toBe("/lessons/a?upgrade=year");
  });
});
