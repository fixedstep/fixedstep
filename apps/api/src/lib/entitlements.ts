import { type Db, activeEntitlementSql, entitlements } from "@fixedstep/db";
import { and, eq } from "drizzle-orm";

export async function hasPro(db: Db, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const rows = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.kind, "pro"), activeEntitlementSql))
    .limit(1);
  return rows.length > 0;
}
