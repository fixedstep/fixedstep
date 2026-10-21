import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import type { AppEnv } from "./context";

/**
 * Serves the built SPA from the API process, so a deploy is one container on any platform
 * (a CDN can still sit in front). Vite's hashed /assets/* are immutable; index.html must be
 * revalidated so a deploy takes effect immediately.
 */
export function mountWeb(app: Hono<AppEnv>, root: string) {
  app.use(
    "/assets/*",
    serveStatic({
      root,
      onFound: (_, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
    }),
  );
  app.use(
    "*",
    serveStatic({ root, onFound: (_, c) => c.header("Cache-Control", "no-cache") }),
  );
  // Extension-less paths are client-side routes: hand them to the SPA router.
  app.get("*", async (c, next) => {
    if (c.req.path.startsWith("/api/") || c.req.path.includes(".")) return next();
    return serveStatic({
      root,
      path: "index.html",
      onFound: (_, c) => c.header("Cache-Control", "no-cache"),
    })(c, next);
  });
}
