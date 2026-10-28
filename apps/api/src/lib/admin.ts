import { type Db, user as userTable } from "@fixedstep/db";
import { eq } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import type { SessionUser } from "../auth";
import type { AppEnv } from "../context";

/**
 * Admin = a verified, non-guest account whose `user.role` is `admin`. The role is read from the
 * DB on every call (it is not in the session, and better-auth never touches the column), so a
 * revoke applies immediately. Grant it with SQL (README).
 */
export async function isAdmin(db: Db, user: SessionUser | null): Promise<boolean> {
  if (!user || user.isAnonymous || !user.emailVerified) return false;
  const [row] = await db
    .select({ role: userTable.role })
    .from(userTable)
    .where(eq(userTable.id, user.id))
    .limit(1);
  return row?.role === "admin";
}

/** 401 when signed out, 403 when signed in but not an admin. */
export function requireAdmin(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "sign in" }, 401);
    if (!(await isAdmin(db, user))) return c.json({ error: "forbidden" }, 403);
    await next();
  };
}
