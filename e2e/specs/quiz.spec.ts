import { expect, test } from "@playwright/test";
import { lessonId, signUp } from "../support/api";
import { LESSONS } from "../support/env";

test("a wrong quiz answer gets feedback, then a right one completes the course", async ({
  page,
}) => {
  await signUp(page.request);
  const id = await lessonId(page.request, LESSONS.quiz);

  const lessonResponse = page.waitForResponse(
    (r) => r.request().method() === "GET" && new URL(r.url()).pathname === `/api/lessons/${id}`,
  );
  await page.goto(`/lessons/${id}`);
  // Quiz answers must never reach the browser.
  const lesson = await (await lessonResponse).json();
  expect(lesson.quiz.length).toBeGreaterThan(0);
  for (const q of lesson.quiz) expect(Object.keys(q).sort()).toEqual(["id", "options", "prompt"]);

  await page.getByRole("radio", { name: "It makes the game run faster" }).check();
  await page.getByRole("radio", { name: "Deterministic, reproducible simulation" }).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByText("Not quite. Try another option.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lesson complete" })).toHaveCount(0);

  await page
    .getByRole("radio", { name: "Movement speed stays the same regardless of frame rate" })
    .check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete" })).toBeVisible();
  await expect(page.getByText("+10 XP")).toBeVisible();
  await expect(page.getByText("That's the end of 2D Game Fundamentals")).toBeVisible();
});
