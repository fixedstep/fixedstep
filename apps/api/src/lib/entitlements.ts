import { activeEntitlementSql, type Db, entitlements, type schema } from "@fixedstep/db";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { SubscriptionUpdate } from "../billing/provider";

export async function hasPro(db: Db, userId: string | undefined): Promise<boolean> {
  if (!userId) return false;
  const rows = await db
    .select({ id: entitlements.id })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), eq(entitlements.kind, "pro"), activeEntitlementSql))
    .limit(1);
  return rows.length > 0;
}

/**
 * Upserts the "pro" entitlement for a subscription. Providers deliver webhooks out of order,
 * so an update older than the stored one is skipped. Returns whether it was applied.
 */
export async function applySubscriptionUpdate(
  db: PgDatabase<PgQueryResultHKT, typeof schema>,
  provider: string,
  event: SubscriptionUpdate,
): Promise<boolean> {
  const values = {
    status: event.status,
    currentPeriodEnd: event.currentPeriodEnd,
    providerModifiedAt: event.modifiedAt,
    userId: event.userId,
  };
  const rows = await db
    .insert(entitlements)
    .values({ kind: "pro", provider, externalId: event.subscriptionId, ...values })
    .onConflictDoUpdate({
      target: [entitlements.provider, entitlements.externalId],
      set: values,
      // Equal times are applied: two events from one change carry the same state.
      setWhere: sql`${isNull(entitlements.providerModifiedAt)} or ${lte(entitlements.providerModifiedAt, sql`excluded.provider_modified_at`)}`,
    })
    .returning({ id: entitlements.id });
  return rows.length > 0;
}
