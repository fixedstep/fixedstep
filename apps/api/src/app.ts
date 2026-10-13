import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { AppEnv, Deps } from "./context";
import { billingRoutes } from "./routes/billing";
import { courseRoutes } from "./routes/courses";
import { lessonRoutes } from "./routes/lessons";
import { meRoutes } from "./routes/me";

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();
  app.use(logger());

  app.get("/health", (c) => c.json({ ok: true }));

  // Better Auth owns /api/auth/*. Web and API share an origin (CloudFront in AWS, the Vite
  // proxy locally), so cookies are first-party and no CORS is needed.
  app.on(["GET", "POST"], "/api/auth/*", (c) => deps.auth.handler(c.req.raw));

  app.use("/api/*", async (c, next) => {
    const session = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    c.set("user", session?.user ?? null);
    await next();
  });

  app.route("/api", courseRoutes(deps));
  app.route("/api", lessonRoutes(deps));
  app.route("/api", meRoutes(deps));
  app.route("/api", billingRoutes(deps));

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}
