import { expect, type Page, test } from "@playwright/test";
import { signUp } from "../support/api";
import { resetLinkFor } from "../support/mail";

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("sign in, sign out, and reset a forgotten password", async ({ page, request }) => {
  // The standalone request context, so the browser stays signed out.
  const user = await signUp(request);

  await page.goto("/login");
  await signIn(page, user.email, user.password);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  expect((await (await page.request.get("/api/me")).json()).user).toBeNull();

  await page.goto("/login");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("we've sent it a link to reset the password")).toBeVisible();

  await expect.poll(() => resetLinkFor(user.email)).not.toBeNull();
  // Through the Vite proxy; the API redirects to /reset-password?token=…
  await page.goto(resetLinkFor(user.email) as string);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  const newPassword = `${user.password}-new`;
  await page.getByLabel("New password").fill(newPassword);
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();

  await page.goto("/login");
  await signIn(page, user.email, user.password);
  await expect(page.getByText("Invalid email or password")).toBeVisible();
  await signIn(page, user.email, newPassword);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});
