import { Hono } from "hono";
import type { AppEnv, Deps } from "../context";
import { hasPro } from "../lib/entitlements";
import { getStats } from "../lib/progress";

export function meRoutes({ db }: Deps) {
  const r = new Hono<AppEnv>();

  r.get("/me", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ user: null, xp: 0, streak: 0, pro: false });
    const [stats, pro] = await Promise.all([getStats(db, user.id), hasPro(db, user.id)]);
    return c.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image ?? null,
        isAnonymous: Boolean(user.isAnonymous),
      },
      ...stats,
      pro,
    });
  });

  return r;
}
