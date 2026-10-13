import { expect, it } from "vitest";
import { streakFromDays } from "./progress";

const today = new Date("2026-10-13T15:00:00Z");

it("counts consecutive days ending today", () => {
  expect(streakFromDays(["2026-10-13", "2026-10-12", "2026-10-11", "2026-10-09"], today)).toBe(3);
});

it("keeps the streak alive if the last activity was yesterday", () => {
  expect(streakFromDays(["2026-10-12", "2026-10-11"], today)).toBe(2);
});

it("resets after a missed day", () => {
  expect(streakFromDays(["2026-10-11"], today)).toBe(0);
  expect(streakFromDays([], today)).toBe(0);
});
