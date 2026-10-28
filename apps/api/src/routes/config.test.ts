import { ClientConfig } from "@fixedstep/content-schema";
import { expect, it } from "vitest";
import type { Env } from "../env";
import { configRoutes } from "./config";

const app = (env: Partial<Env>) => configRoutes({ env: env as Env });

it("reports analytics off without a key", async () => {
  const res = await app({ POSTHOG_HOST: "https://us.i.posthog.com" }).request("/config");
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-cache");
  expect(ClientConfig.parse(await res.json())).toEqual({ analytics: null });
});

it("hands the browser the public key, host and stage", async () => {
  const res = await app({
    POSTHOG_KEY: "phc_test",
    POSTHOG_HOST: "https://us.i.posthog.com",
    APP_STAGE: "staging",
  }).request("/config");
  expect(ClientConfig.parse(await res.json())).toEqual({
    analytics: { key: "phc_test", host: "https://us.i.posthog.com", stage: "staging" },
  });
});

it("keeps analytics off when a key is set without a stage", async () => {
  const res = await app({
    POSTHOG_KEY: "phc_test",
    POSTHOG_HOST: "https://us.i.posthog.com",
  }).request("/config");
  expect(ClientConfig.parse(await res.json())).toEqual({ analytics: null });
});

it("treats an empty key as off", async () => {
  const res = await app({ POSTHOG_KEY: "", APP_STAGE: "prod" }).request("/config");
  expect(await res.json()).toEqual({ analytics: null });
});
