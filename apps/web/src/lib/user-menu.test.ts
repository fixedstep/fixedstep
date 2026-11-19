import { describe, expect, it } from "vitest";
import { initials, menuKeyTarget } from "./user-menu";

describe("initials", () => {
  it("uses first and last word", () => {
    expect(initials("E2E user")).toBe("EU");
    expect(initials("Ada Augusta King")).toBe("AK");
  });
  it("uses one letter for a single word", () => {
    expect(initials("ada")).toBe("A");
  });
  it("returns ? for empty or blank names", () => {
    expect(initials("")).toBe("?");
    expect(initials("   \t\n")).toBe("?");
  });
  it("trims and collapses odd whitespace", () => {
    expect(initials("  ada   lovelace  ")).toBe("AL");
  });
  it("takes whole code points, not surrogate halves", () => {
    expect(initials("😀 smith")).toBe("😀S");
    expect(initials("𝒜da")).toBe("𝒜");
  });
  it("uppercases non-ASCII", () => {
    expect(initials("élan vital")).toBe("ÉV");
  });
});

describe("menuKeyTarget", () => {
  it("ArrowDown moves forward and wraps", () => {
    expect(menuKeyTarget("ArrowDown", 0, 3)).toBe(1);
    expect(menuKeyTarget("ArrowDown", 2, 3)).toBe(0);
    expect(menuKeyTarget("ArrowDown", -1, 3)).toBe(0);
  });
  it("ArrowUp moves back and wraps", () => {
    expect(menuKeyTarget("ArrowUp", 2, 3)).toBe(1);
    expect(menuKeyTarget("ArrowUp", 0, 3)).toBe(2);
    expect(menuKeyTarget("ArrowUp", -1, 3)).toBe(2);
  });
  it("single item stays put", () => {
    expect(menuKeyTarget("ArrowDown", 0, 1)).toBe(0);
    expect(menuKeyTarget("ArrowUp", 0, 1)).toBe(0);
  });
  it("Home and End", () => {
    expect(menuKeyTarget("Home", 2, 4)).toBe(0);
    expect(menuKeyTarget("End", 0, 4)).toBe(3);
    expect(menuKeyTarget("Home", -1, 4)).toBe(0);
  });
  it("Escape closes", () => {
    expect(menuKeyTarget("Escape", 1, 3)).toBe("close");
  });
  it("ignores other keys", () => {
    for (const k of ["a", "Enter", " ", "Tab", "ArrowLeft", "ArrowRight", ""]) {
      expect(menuKeyTarget(k, 1, 3)).toBeNull();
    }
  });
});
