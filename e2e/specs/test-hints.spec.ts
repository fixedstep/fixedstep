// Journey: a student with failing code sees the author's hint under the failed test (local and
// server run), and no hint once the code passes. Cost: ~3 page loads, one worker run.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { lessonId } from "../support/api";
import { COURSE, LESSONS, REPO_ROOT } from "../support/env";

const solution = readFileSync(
  join(REPO_ROOT, "content-sample/courses", COURSE, "game-loop", LESSONS.code, "solution.ts"),
  "utf8",
);

// Forgets dt, but returns a new object: only "moves along x" (which has a hint) fails among
// the hinted tests.
const forgetsDt = `export type Vec2 = { x: number; y: number };
export function move(pos: Vec2, vel: Vec2, dt: number): Vec2 {
  return { x: pos.x + vel.x, y: pos.y + vel.y };
}
`;

const HINT = "Scale velocity by dt: pos + vel * dt, not pos + vel.";

async function setCode(page: import("@playwright/test").Page, code: string) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(code);
}

test("a failing hinted test shows its hint locally and on the server, and not once passing", async ({
  page,
}) => {
  await page.goto(`/lessons/${await lessonId(page.request, LESSONS.code)}`);
  const hints = page.locator(".test-hint");

  await setCode(page, forgetsDt);
  await page.getByRole("button", { name: /^Run tests/ }).click();
  await expect(hints).toHaveCount(1);
  await expect(hints).toContainText(HINT);

  await page.getByRole("button", { name: /^Submit/ }).click();
  await expect(page.getByRole("heading", { name: /Server check/ })).toBeVisible();
  await expect(hints).toHaveCount(1);
  await expect(hints).toContainText(HINT);

  await setCode(page, solution);
  await page.getByRole("button", { name: /^Run tests/ }).click();
  await page.getByRole("button", { name: /^Submit/ }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  await expect(hints).toHaveCount(0);
});

test("the hint wraps at phone width without horizontal page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/lessons/${await lessonId(page.request, LESSONS.code)}`);
  await setCode(page, forgetsDt);
  await page.getByRole("button", { name: /^Run tests/ }).click();
  const hint = page.locator(".test-hint");
  await expect(hint).toContainText(HINT);
  await hint.scrollIntoViewIfNeeded();

  const box = await hint.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(360);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
