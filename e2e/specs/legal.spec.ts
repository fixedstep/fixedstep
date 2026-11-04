import { expect, test } from "@playwright/test";
import { lessonId, signUp } from "../support/api";
import { LESSONS } from "../support/env";

test("the footer links to the privacy policy and terms, which load directly too", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".site-footer").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  await expect(page.getByText(/^Effective \d{4}-\d{2}-\d{2}$/)).toBeVisible();

  await page.locator(".site-footer").getByRole("link", { name: "Terms" }).click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
  await expect(page.getByText(/^Effective \d{4}-\d{2}-\d{2}$/)).toBeVisible();

  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(page.locator(".legal h1")).toBeVisible();
  }
});

test("the sign-up page links to the terms and privacy policy", async ({ page }) => {
  await page.goto("/login?mode=signUp");
  const notice = page.locator(".legal-notice");
  await expect(notice).toContainText("By creating an account or continuing with GitHub");
  await expect(notice.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
    "href",
    "/terms",
  );
  await expect(notice.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
    "href",
    "/privacy",
  );
});

test("the Pro upgrade on a paid lesson shows the Polar notice", async ({ page }) => {
  await signUp(page.request);
  const id = await lessonId(page.request, LESSONS.paid);
  await page.goto(`/lessons/${id}`);
  // Not clicked: it starts a Polar checkout.
  await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeVisible();
  await expect(
    page.locator(".legal-notice").filter({ hasText: "merchant of record" }),
  ).toBeVisible();
});

test("the cookies and local storage the policy describes are the only ones set", async ({
  page,
}) => {
  await signUp(page.request);
  const id = await lessonId(page.request, LESSONS.reading);
  await page.goto(`/lessons/${id}`);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const cookies = await page.context().cookies();
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies) {
    expect(cookie.name).toMatch(/^(__Secure-)?better-auth\./);
  }
  const keys = await page.evaluate(() => Object.keys(localStorage));
  for (const key of keys) {
    expect(key).toMatch(/^fixedstep:/);
  }
});
