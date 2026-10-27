// Journey: a guest stuck on a code lesson unlocks hints one per failed submission, reveals them
// in order, keeps them across a reload, and a pass unlocks nothing. Cost: ~2 page loads and 3
// server submissions in one test, plus one phone-width load.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { lessonId } from "../support/api";
import { COURSE, LESSONS, REPO_ROOT } from "../support/env";

const solution = readFileSync(
  join(REPO_ROOT, "content-sample/courses", COURSE, "game-loop", LESSONS.code, "solution.ts"),
  "utf8",
);

const forgetsDt = `export type Vec2 = { x: number; y: number };
export function move(pos: Vec2, vel: Vec2, dt: number): Vec2 {
  return { x: pos.x + vel.x, y: pos.y + vel.y };
}
`;

async function setCode(page: Page, code: string) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(code);
}

async function submit(page: Page) {
  const done = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.url().endsWith("/submit"),
  );
  await page.getByRole("button", { name: /^Submit/ }).click();
  await done;
}

test("hints unlock one per failed submission, reveal in order and persist across reload", async ({
  page,
}) => {
  await page.goto(`/lessons/${await lessonId(page.request, LESSONS.code)}`);
  const panel = page.getByRole("region", { name: "Hints" });
  await expect(panel.getByText(/^Hint \d of 3$/)).toHaveCount(3);
  await expect(panel.getByRole("button", { name: /^Show hint/ })).toHaveCount(0);
  await expect(panel.getByText(/^Unlocks after/)).toHaveCount(3);

  await setCode(page, forgetsDt);
  await submit(page);
  await expect(panel.getByRole("button", { name: "Show hint 1" })).toBeVisible();
  await expect(panel.getByText(/^Unlocks after/)).toHaveCount(2);
  await panel.getByRole("button", { name: "Show hint 1" }).click();
  await expect(panel.getByText(/How far should the object travel/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Show hint 2" })).toHaveCount(0);
  await expect(panel.getByText(/^Unlocks after/)).toHaveCount(2);

  await submit(page);
  await expect(panel.getByRole("button", { name: "Show hint 2" })).toBeVisible();
  await expect(panel.getByText(/^Unlocks after/)).toHaveCount(1);

  await page.reload();
  const again = page.getByRole("region", { name: "Hints" });
  await expect(again.getByText(/How far should the object travel/)).toBeVisible();
  await expect(again.getByRole("button", { name: "Show hint 2" })).toBeVisible();
  await expect(again.getByText(/Each axis moves by/)).toHaveCount(0);

  await setCode(page, solution);
  await submit(page);
  await expect(page.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  await expect(again.getByRole("button", { name: "Show hint 3" })).toHaveCount(0);
  await expect(again.getByText(/^Unlocks after/)).toHaveCount(1);
});

test("the hints panel fits at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/lessons/${await lessonId(page.request, LESSONS.code)}`);
  await setCode(page, forgetsDt);
  await submit(page);
  const panel = page.getByRole("region", { name: "Hints" });
  await panel.getByRole("button", { name: "Show hint 1" }).click();
  await expect(panel.getByText(/How far should the object travel/)).toBeVisible();
  await panel.scrollIntoViewIfNeeded();

  const box = await panel.boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(360);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
