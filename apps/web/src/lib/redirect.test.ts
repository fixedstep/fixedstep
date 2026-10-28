import { describe, expect, it } from "vitest";
import { isSafeRedirect, withParam, withUpgrade } from "./redirect";

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

describe("withParam", () => {
  it("sets the param, keeping the query and hash", () => {
    expect(withParam("/", "verified", "1")).toBe("/?verified=1");
    expect(withParam("/lessons/a?x=1#h", "verified", "1")).toBe("/lessons/a?x=1&verified=1#h");
  });

  it("replaces an existing value", () => {
    expect(withParam("/?signed_up=email", "signed_up", "github")).toBe("/?signed_up=github");
  });
});
