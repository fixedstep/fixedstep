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

  // The save feedback mustn't move the stars. The PUT is held, then answered here rather than
  // by the server, so this test leaves the shared course rating alone for the test above.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/courses\/[^/]+\/rating$/, async (route) => {
    await held;
    await route.fulfill({ json: { average: null, count: 1, mine: 4 } });
  });
  const stars = bar.locator(".star-rating");
  const status = bar.getByRole("status");
  const at = async () => {
    const b = await stars.boundingBox();
    expect(
      await page.locator(".lesson-bar").evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(0);
    return { x: b?.x, y: b?.y };
  };
  const before = await at();

  await bar.getByRole("radio", { name: "Rate 1 out of 5" }).focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("Saving…");
  expect(await at()).toEqual(before);

  release();
  await expect(status).toHaveText("Saved: you rated 4 out of 5");
  expect(await at()).toEqual(before);

  // "Saved" clears after 3 s.
  await expect(status).toHaveText("", { timeout: 6000 });
  expect(await at()).toEqual(before);
});

test("a failed save's message fits the status line on a wide screen", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signUp(page.request);
  const id = await lessonId(page.request, LESSONS.reading);
  await completeLesson(page.request, id);
  await page.route(/\/api\/courses\/[^/]+\/rating$/, (route) => route.fulfill({ status: 500 }));
  await page.goto(`/lessons/${id}`);

  const bar = page.getByRole("group", { name: "Course rating" });
  const status = bar.getByRole("status");
  const empty = await status.boundingBox();
  await bar.getByRole("radio", { name: "Rate 2 out of 5" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(status).toHaveText("Couldn't save your rating. Try again.");
  // Still one line: the reserved box hasn't grown.
  expect((await status.boundingBox())?.height).toBe(empty?.height);
});

test("the bar shows the summary but no stars to a guest or a learner with no completed lesson", async ({
  page,
}) => {
  const id = await lessonId(page.request, LESSONS.reading);
  const bar = page.getByRole("group", { name: "Course rating" });

  await page.goto(`/lessons/${id}`);
  await expect(bar.locator(".rating-summary")).toBeVisible();
  await expect(bar.getByRole("radio")).toHaveCount(0);

  // Signed in, but nothing completed yet: still not eligible to rate.
  await signUp(page.request);
  await page.goto(`/lessons/${id}`);
  await expect(bar.locator(".rating-summary")).toBeVisible();
  await expect(bar.getByRole("radio")).toHaveCount(0);
});

test("on the course's last lesson the completion card's stars sit alongside the bar's", async ({
  page,
}) => {
  await signUp(page.request);
  await completeLesson(page.request, await lessonId(page.request, LESSONS.reading));
  await page.goto(`/lessons/${await lessonId(page.request, LESSONS.quiz)}`);

  await page
    .getByRole("radio", { name: "Movement speed stays the same regardless of frame rate" })
    .check();
  await page.getByRole("radio", { name: "Deterministic, reproducible simulation" }).check();
  await page.getByRole("button", { name: "Submit answers" }).click();
  await expect(page.getByRole("heading", { name: "Lesson complete" })).toBeVisible();

  // Two widgets for one course, with separate radio names, so both stay operable.
  await expect(page.getByRole("radio", { name: "Rate 3 out of 5" })).toHaveCount(2);
  await expect(
    page
      .getByRole("group", { name: "Course rating" })
      .getByRole("radio", { name: "Rate 3 out of 5" }),
  ).toHaveCount(1);
});
