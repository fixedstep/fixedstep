import { Slug } from "@fixedstep/content-schema";
import { Hono } from "hono";
import type { AppEnv, Deps } from "../context";
import { requireAdmin } from "../lib/admin";
import { courseMetrics } from "../lib/learning-metrics";

export function adminRoutes({ db }: Pick<Deps, "db">) {
  const r = new Hono<AppEnv>();
  r.use("/admin/*", requireAdmin(db));

  r.get("/admin/metrics", async (c) => c.json(await courseMetrics(db)));

  r.get("/admin/metrics/:slug", async (c) => {
    const slug = c.req.param("slug");
    const [course] = Slug.safeParse(slug).success
      ? await courseMetrics(db, { courseSlug: slug })
      : [];
    if (!course) return c.json({ error: "not found" }, 404);
    return c.json(course);
  });

  return r;
}
