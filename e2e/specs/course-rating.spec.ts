import { expect, type Locator, type Page, test } from "@playwright/test";
import { completeLesson, lessonId, newUser, rateCourse, signUp } from "../support/api";
import { COURSE, LESSONS, WEB_URL } from "../support/env";

// Ratings are shared per course, so a retry would start with 3 ratings. Local reruns are
// covered by start-api.ts recreating the database.
test.describe.configure({ retries: 0 });

/** Presses Tab until `target` has focus, the way a keyboard user would reach it. */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 40; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test("a student rates the course from the lesson bar with the keyboard only", async ({
  page,
  playwright,
}) => {
  // The database is fresh per run and this is the only spec that rates.
  await page.goto("/");
  await expect(page.getByText("Not enough ratings yet")).toBeVisible();

  // Two other raters, each eligible the real way: signed up with a completed lesson.
  for (const [tag, stars] of [
    ["rater-a", 5],
    ["rater-b", 4],
  ] as const) {
    const request = await playwright.request.newContext({ baseURL: WEB_URL });
    await signUp(request, newUser(tag));
    await completeLesson(request, await lessonId(request, LESSONS.reading));
    await rateCourse(request, COURSE, stars);
    await request.dispose();
  }

  await signUp(page.request);
  const id = await lessonId(page.request, LESSONS.reading);
  await completeLesson(page.request, id);

  // Fake timers from the first page load, so the rating's debounce uses them. The clock still
  // flows in real time until runFor below.
  await page.clock.install();
  await page.goto(`/lessons/${id}`);
  const bar = page.getByRole("group", { name: "Course rating" });
  await expect(bar.getByText("Not enough ratings yet")).toBeVisible();
  // One widget in the shell. A DOM locator, because role queries skip a hidden outline.
  await expect(page.locator("#course-outline .star-rating")).toHaveCount(0);

  const puts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "PUT" && /\/api\/courses\/[^/]+\/rating$/.test(r.url())) puts.push(r.url());
  });

  await tabTo(page, bar.getByRole("radio", { name: "Rate 1 out of 5" }));
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  // Past the 500 ms debounce (but short of the 3 s "Saved" reset), so a leftover arrow-key
  // timer would have fired its own PUT by now.
  await page.clock.runFor(1000);

  await expect(bar.getByText("Saved: you rated 4 out of 5")).toBeVisible();
  await expect(bar.getByRole("radio", { name: "Rate 4 out of 5" })).toBeChecked();
  // (5 + 4 + 4) / 3, rounded on the server.
  await expect(bar.getByText("4.3 ★ (3)")).toBeVisible();
  // The debounce and Enter together send exactly one PUT.
  expect(puts).toHaveLength(1);

  await page.goto("/");
  await expect(page.getByText("4.3 ★ (3)")).toBeVisible();
});

test("the rating line fits at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await signUp(page.request);
  const id = await lessonId(page.request, LESSONS.reading);
  await completeLesson(page.request, id);
  await page.goto(`/lessons/${id}`);

  const bar = page.getByRole("group", { name: "Course rating" });
  // "Not enough ratings yet" or the average, depending on how far the parallel test has got.
  await expect(bar.locator(".rating-summary")).toBeVisible();
  await expect(bar.getByRole("radio", { name: "Rate 1 out of 5" })).toBeVisible();
  // The outline is a closed drawer at this width; the rating doesn't need it.
  await expect(page.locator("#course-outline")).toBeHidden();
  // Scoped to the bar: the reading lesson's own body is wider than 360px, which is a separate
  // issue from the rating line.
  const box = await page.locator(".lesson-bar").boundingBox();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(360);
  const ratingBox = await bar.boundingBox();
  expect((ratingBox?.x ?? 0) + (ratingBox?.width ?? 0)).toBeLessThanOrEqual(360);
  expect(
    await page.locator(".lesson-bar").evaluate((el) => el.scrollWidth - el.clientWidth),
  ).toBeLessThanOrEqual(0);
});
