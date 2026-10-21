import { timingSafeEqual } from "node:crypto";
import { parseBundle } from "@fixedstep/content-cli/bundle";
import { syncContent } from "@fixedstep/content-cli/sync";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv, Deps } from "../context";

function sameToken(header: string | undefined, token: string): boolean {
  const given = Buffer.from(header?.replace(/^Bearer /, "") ?? "");
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Machine-to-machine endpoints. The private content repo's CI validates and bundles its
 * content, then POSTs the bundle here, so it holds one token and never database credentials.
 */
export function internalRoutes(deps: Pick<Deps, "db">, opts: { contentSyncToken: string }) {
  const app = new Hono<AppEnv>();

  app.post("/content", bodyLimit({ maxSize: 50 * 1024 * 1024 }), async (c) => {
    if (!sameToken(c.req.header("authorization"), opts.contentSyncToken)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    let bundle: ReturnType<typeof parseBundle>;
    try {
      bundle = parseBundle(await c.req.text());
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "invalid bundle" }, 400);
    }
    await syncContent(deps.db, bundle.courses);
    console.log(`[content] synced ${bundle.courses.length} course(s) from ${bundle.createdAt}`);
    return c.json({ courses: bundle.courses.length });
  });

  return app;
}
