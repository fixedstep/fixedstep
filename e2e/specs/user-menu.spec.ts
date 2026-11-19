import { expect, test } from "@playwright/test";
import { signUp } from "../support/api";
import { expectNoPageScrollX } from "../support/layout";

test("open the account menu with the mouse, go to settings, sign out", async ({ page }) => {
  const user = await signUp(page.request);
  await page.goto("/");
  const trigger = page.getByRole("banner").getByRole("button", { name: user.name });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText(["Settings", "Sign out"]);

  await menu.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText(user.email).last()).toBeVisible();
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  expect((await (await page.request.get("/api/me")).json()).user).toBeNull();
});

test("the account menu works from the keyboard and closes on Escape, Tab and outside click", async ({
  page,
}) => {
  const user = await signUp(page.request);
  await page.goto("/");
  const trigger = page.getByRole("banner").getByRole("button", { name: user.name });
  const menu = page.getByRole("menu");
  const settings = page.getByRole("menuitem", { name: "Settings" });
  const signOut = page.getByRole("menuitem", { name: "Sign out" });
  await expect(trigger).toBeVisible();

  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(settings).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(signOut).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(settings).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(signOut).toBeFocused();
  await page.keyboard.press("Home");
  await expect(settings).toBeFocused();
  await page.keyboard.press("End");
  await expect(signOut).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await page.keyboard.press("ArrowDown");
  await expect(menu).toBeVisible();
  await expect(settings).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await page.keyboard.press("ArrowUp");
  await expect(menu).toBeVisible();
  await expect(signOut).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await page.keyboard.press("Space");
  await expect(menu).toBeVisible();
  await expect(settings).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await expect(menu).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  // Space on the Settings link follows it, as Enter does.
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(settings).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(menu).toBeHidden();
});

test.describe("phone width", () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test("the open account menu stays inside the 16px gutters", async ({ page }) => {
    const user = await signUp(page.request);
    await page.goto("/");
    await page.getByRole("banner").getByRole("button", { name: user.name }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    const panel = page.locator(".user-menu-panel");
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.x).toBeGreaterThanOrEqual(16);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375 - 16 + 1);
    await expectNoPageScrollX(page);
  });
});
