import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono, MiddlewareHandler } from "hono";
import type { AppEnv } from "./context";

/**
 * serveStatic with a Cache-Control header on files it serves. Its `onFound` runs after the
 * response is built, so headers set there are lost; set it on the returned response instead.
 */
function staticWithCache(
  options: { root: string; path?: string },
  cacheControl: string,
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    let found = false;
    const res = await serveStatic<AppEnv>({
      ...options,
      onFound: () => {
        found = true;
      },
    })(c, next);
    if (found && res) res.headers.set("Cache-Control", cacheControl);
    return res;
  };
}

/**
 * Serves the built SPA from the API process, so a deploy is one container on any platform
 * (a CDN can still sit in front). Vite's hashed /assets/* are immutable; index.html must be
 * revalidated so a deploy takes effect immediately.
 */
export function mountWeb(app: Hono<AppEnv>, root: string) {
  app.use("/assets/*", staticWithCache({ root }, "public, max-age=31536000, immutable"));
  app.use("*", staticWithCache({ root }, "no-cache"));
  // Extension-less paths are client-side routes: hand them to the SPA router.
  app.get("*", async (c, next) => {
    if (c.req.path.startsWith("/api/") || c.req.path.includes(".")) return next();
    return staticWithCache({ root, path: "index.html" }, "no-cache")(c, next);
  });
}
