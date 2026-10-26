import { expect, test } from "@playwright/test";
import { lessonId, signUp } from "../support/api";
import { LESSONS } from "../support/env";

test("a signed-out visitor sees the locked Pro lesson", async ({ page }) => {
  const id = await lessonId(page.request, LESSONS.paid);
  const lessonResponse = page.waitForResponse(
    (r) => r.request().method() === "GET" && new URL(r.url()).pathname === `/api/lessons/${id}`,
  );
  await page.goto(`/lessons/${id}`);
  const res = await lessonResponse;
  expect(res.status()).toBe(402);
  // Only the locked stub: no body, starter code or tests.
  expect(Object.keys(await res.json()).sort()).toEqual(["id", "locked", "title"]);

  await expect(page.getByText("Pro lesson", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /Bouncing ball/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create an account to upgrade" })).toBeVisible();
});

test("a signed-in user without Pro is offered the upgrade", async ({ page }) => {
  await signUp(page.request);
  const id = await lessonId(page.request, LESSONS.paid);
  await page.goto(`/lessons/${id}`);
  // Not clicked: it starts a Polar checkout.
  await expect(page.getByRole("button", { name: "Upgrade to Pro" })).toBeVisible();
});
