import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { lessonId, newUser } from "../support/api";
import { COURSE, LESSONS, REPO_ROOT } from "../support/env";

const solution = readFileSync(
  join(REPO_ROOT, "content-sample/courses", COURSE, "game-loop", LESSONS.code, "solution.ts"),
  "utf8",
);

test("a guest passes a code lesson, then signs up and keeps their progress", async ({ page }) => {
  const id = await lessonId(page.request, LESSONS.code);
  const lessonResponse = page.waitForResponse(
    (r) => r.request().method() === "GET" && new URL(r.url()).pathname === `/api/lessons/${id}`,
  );
  await page.goto(`/lessons/${id}`);

  // Hidden tests and the solution never reach the browser.
  const lesson = await (await lessonResponse).json();
  expect(lesson.hasHiddenTests).toBe(true);
  expect(lesson).not.toHaveProperty("hiddenTests");
  expect(lesson).not.toHaveProperty("solution");

  // insertText adds the text as one input, so CodeMirror doesn't auto-indent or close brackets.
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(solution);
  await page.getByRole("button", { name: /^Submit/ }).click();

  await expect(page.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  await expect(page.getByText("+10 XP")).toBeVisible();
  await expect(page.getByTitle("Experience")).toHaveText("⭐ 10 XP");
  await expect(page.getByRole("link", { name: "Save progress" })).toBeVisible();

  await page.getByRole("link", { name: "Create a free account" }).click();
  await expect(page.getByRole("heading", { name: "Save your progress" })).toBeVisible();
  const user = newUser("guest");
  await page.getByLabel("Name").fill(user.name);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign up", exact: true }).click();

  await expect(page).toHaveURL(new RegExp(`/lessons/${id}$`));
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await expect(page.getByTitle("Experience")).toHaveText("⭐ 10 XP");
  await expect(page.getByRole("heading", { level: 1 }).getByTitle("Completed")).toBeVisible();

  const me = await (await page.request.get("/api/me")).json();
  expect(me.user.isAnonymous).toBe(false);
  expect(me.xp).toBe(10);
});
