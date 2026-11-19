import { expect, test } from "@playwright/test";
import { lessonId, signUp } from "../support/api";
import { LESSONS } from "../support/env";
import { expectNoPageScrollX } from "../support/layout";

// A phone-width viewport. Each test signs up (except the signed-out home) so the topbar is the
// widest one a non-Pro learner gets.
test.use({ viewport: { width: 360, height: 740 } });

test("a reading lesson scrolls its code in a box, not the page", async ({ page }) => {
  await signUp(page.request);
  const id = await lessonId(page.request, LESSONS.reading);
  await page.goto(`/lessons/${id}`);
  await expect(page.getByRole("heading", { level: 1, name: "What is a game loop?" })).toBeVisible();
  await expect(page.locator(".snippet-tabs pre")).toBeVisible();
  await expect(page.locator(".playground .cm-content")).toBeVisible();

  // The snippet is wider than the phone, so it has to scroll in its own box for this to mean
  // anything.
  expect(
    await page.locator(".snippet-tabs pre").evaluate((el) => el.scrollWidth > el.clientWidth),
  ).toBe(true);
  await expectNoPageScrollX(page);

  for (const name of ["C++", "C#", "Odin"]) {
    await page.getByRole("tab", { name }).click();
    await expectNoPageScrollX(page);
  }
});

test("a quiz lesson has no sideways page scroll", async ({ page }) => {
  await signUp(page.request);
  const id = await lessonId(page.request, LESSONS.quiz);
  await page.goto(`/lessons/${id}`);
  await expect(page.getByRole("button", { name: "Submit answers" })).toBeVisible();
  await expectNoPageScrollX(page);
});

test("a code lesson has no sideways page scroll", async ({ page }) => {
  await signUp(page.request);
  const id = await lessonId(page.request, LESSONS.code);
  await page.goto(`/lessons/${id}`);
  await expect(page.locator(".workspace .cm-editor")).toBeVisible();
  await expectNoPageScrollX(page);
});

test("the signed-out home page has no sideways page scroll, even with the hero code open", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".course-card .chapters")).toBeVisible();
  await expectNoPageScrollX(page);

  await page.getByRole("button", { name: "</> Show code" }).click();
  await expect(page.locator(".hero .cm-content")).toBeVisible();
  await expectNoPageScrollX(page);
});

test("the signed-in home page has no sideways page scroll", async ({ page }) => {
  await signUp(page.request);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Pick up where you left off" })).toBeVisible();
  await expect(page.locator(".chapters")).toBeVisible();
  await expectNoPageScrollX(page);
});

test("a sim lesson's paywall has no sideways page scroll", async ({ page }) => {
  // The sim lesson body is Pro-only and e2e has no Pro user, so this covers the paywall route.
  await signUp(page.request);
  const id = await lessonId(page.request, LESSONS.paid);
  await page.goto(`/lessons/${id}`);
  await expect(page.getByText("Upgrade to Pro").first()).toBeVisible();
  await expectNoPageScrollX(page);
});

test("the privacy and terms pages have no sideways page scroll", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  await expectNoPageScrollX(page);

  await page.goto("/terms");
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
  await expectNoPageScrollX(page);
});
