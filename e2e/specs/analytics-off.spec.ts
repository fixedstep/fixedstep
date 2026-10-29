import { expect, test } from "@playwright/test";
import { lessonId, signUp } from "../support/api";
import { LESSONS } from "../support/env";

// Journey: the app runs with analytics off (no POSTHOG_KEY in e2e). Cost: ~3s.
test("with no PostHog key the app talks to no PostHog host and stores no analytics state", async ({
  page,
  request,
}) => {
  const hosts: string[] = [];
  page.on("request", (r) => hosts.push(new URL(r.url()).hostname));

  const config = await page.request.get("/api/config");
  expect(config.ok()).toBe(true);
  expect((await config.json()).analytics).toBeNull();

  await signUp(page.request);
  const id = await lessonId(request, LESSONS.reading);
  await page.goto(`/lessons/${id}`);
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  expect(hosts.filter((h) => h.endsWith("posthog.com"))).toEqual([]);

  const storage = await page.evaluate(() => Object.keys(localStorage));
  expect(storage.filter((k) => /ph_|posthog/i.test(k))).toEqual([]);
  const cookies = await page.context().cookies();
  expect(cookies.filter((c) => /ph_|posthog/i.test(c.name))).toEqual([]);
});

// Journey: admin metrics are guarded. Cost: <1s.
test("/api/admin/metrics is 401 signed out and 403 for a normal user", async ({
  playwright,
  baseURL,
}) => {
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get("/api/admin/metrics")).status()).toBe(401);
  expect((await anon.get("/api/admin/metrics/2d-fundamentals")).status()).toBe(401);

  await signUp(anon);
  expect((await anon.get("/api/admin/metrics")).status()).toBe(403);
  expect((await anon.get("/api/admin/metrics/2d-fundamentals")).status()).toBe(403);
  await anon.dispose();
});
