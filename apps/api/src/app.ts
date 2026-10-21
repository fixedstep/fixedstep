import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import type { AppEnv, Deps } from "./context";
import { billingRoutes } from "./routes/billing";
import { courseRoutes } from "./routes/courses";
import { internalRoutes } from "./routes/internal";
import { lessonRoutes } from "./routes/lessons";
import { meRoutes } from "./routes/me";
import { mountWeb } from "./web";

export function createApp(deps: Deps) {
  const app = new Hono<AppEnv>();
  app.use(logger());

  app.get("/health", (c) => c.json({ ok: true }));

  if (deps.env.CONTENT_SYNC_TOKEN) {
    app.route("/internal", internalRoutes(deps, { contentSyncToken: deps.env.CONTENT_SYNC_TOKEN }));
  }

  // Better Auth owns /api/auth/*. Web and API share an origin (this process serves the SPA in
  // production, the Vite proxy locally), so cookies are first-party and no CORS is needed.
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

  if (deps.env.WEB_DIR) mountWeb(app, deps.env.WEB_DIR);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    console.error(err);
    return c.json({ error: "internal error" }, 500);
  });

  return app;
}
