import { entitlements, user } from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { beforeAll, expect, it } from "vitest";
import type { SubscriptionUpdate } from "../billing/provider";
import { applySubscriptionUpdate } from "./entitlements";

let db: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: "u1", name: "Test", email: "u1@test.dev" });
}, 30_000);

let n = 0;
const update = (status: SubscriptionUpdate["status"], modifiedAt: string): SubscriptionUpdate => ({
  type: "subscription",
  eventId: `evt_${++n}`,
  rawType: `subscription.${status}`,
  userId: "u1",
  subscriptionId: "sub_1",
  status,
  currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
  modifiedAt: new Date(modifiedAt),
});

const statusOf = async () =>
  (await db.select({ status: entitlements.status }).from(entitlements))[0]?.status;

it("keeps the newest state when webhooks arrive out of order", async () => {
  const active = update("active", "2026-10-01T00:00:00Z");
  const canceled = update("canceled", "2026-10-05T00:00:00Z");
  const revoked = update("revoked", "2026-11-01T00:00:00Z");

  // Delivered as: revoked, active (late retry), canceled (late retry).
  expect(await applySubscriptionUpdate(db, "polar", revoked)).toBe(true);
  expect(await applySubscriptionUpdate(db, "polar", active)).toBe(false);
  expect(await applySubscriptionUpdate(db, "polar", canceled)).toBe(false);
  expect(await statusOf()).toBe("revoked");

  // A genuinely newer change (resubscribed) still applies.
  expect(await applySubscriptionUpdate(db, "polar", update("active", "2026-12-01T00:00:00Z"))).toBe(
    true,
  );
  expect(await statusOf()).toBe("active");
});
