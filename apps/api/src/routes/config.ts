import type { ClientConfig } from "@fixedstep/content-schema";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../context";

/** Runtime config for the SPA, so one image serves every stage (no build-time VITE_* vars). */
export function configRoutes({ env }: Pick<Deps, "env">) {
  const r = new Hono<AppEnv>();

  r.get("/config", (c) => {
    c.header("Cache-Control", "no-cache");
    return c.json({
      analytics:
        env.POSTHOG_KEY && env.APP_STAGE
          ? { key: env.POSTHOG_KEY, host: env.POSTHOG_HOST, stage: env.APP_STAGE }
          : null,
    } satisfies ClientConfig);
  });

  return r;
}
