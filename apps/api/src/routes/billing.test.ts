import { billingEvents, entitlements, user } from "@fixedstep/db";
import { createTestDb } from "@fixedstep/db/testing";
import { eq } from "drizzle-orm";
import { beforeAll, expect, it, vi } from "vitest";
import type { BillingProvider, SubscriptionUpdate } from "../billing/provider";
import * as entitlementsLib from "../lib/entitlements";
import { billingRoutes } from "./billing";

let db: Awaited<ReturnType<typeof createTestDb>>;
let app: ReturnType<typeof billingRoutes>;

// Signature checks are covered in polar.test.ts; this provider takes the body as the event.
const billing = {
  name: "test",
  parseWebhook: (raw: string) => {
    const e = JSON.parse(raw);
    return { ...e, currentPeriodEnd: null, modifiedAt: new Date(e.modifiedAt) };
  },
} as unknown as BillingProvider;

beforeAll(async () => {
  db = await createTestDb();
  await db.insert(user).values({ id: "u1", name: "Test", email: "u1@test.dev" });
  app = billingRoutes({ db: db as never, billing, env: {} as never } as never);
}, 30_000);

let n = 0;
const event = (overrides: Partial<SubscriptionUpdate> = {}) => ({
  type: "subscription",
  eventId: `evt_${++n}`,
  rawType: "subscription.active",
  userId: "u1",
  subscriptionId: `sub_${n}`,
  status: "active",
  modifiedAt: "2026-10-01T00:00:00Z",
  ...overrides,
});

const deliver = (body: object) =>
  app.request("/billing/webhooks/test", { method: "POST", body: JSON.stringify(body) });

const entitlementFor = async (subscriptionId: string) =>
  (await db.select().from(entitlements).where(eq(entitlements.externalId, subscriptionId)))[0];

const eventRow = async (id: string) =>
  (await db.select().from(billingEvents).where(eq(billingEvents.id, id)))[0];

it("applies an event once and treats a redelivery as a duplicate", async () => {
  const e = event();
  const first = await deliver(e);
  expect(first.status).toBe(200);
  expect(await first.json()).toEqual({ ok: true });
  expect((await entitlementFor(e.subscriptionId))?.status).toBe("active");

  const again = await deliver(e);
  expect(await again.json()).toEqual({ ok: true, duplicate: true });
});

it("processes a retry when applying the event failed the first time", async () => {
  const spy = vi
    .spyOn(entitlementsLib, "applySubscriptionUpdate")
    .mockRejectedValueOnce(new Error("connection reset"));
  const e = event();

  expect((await deliver(e)).status).toBe(500);
  expect(await eventRow(e.eventId)).toBeUndefined();
  expect(await entitlementFor(e.subscriptionId)).toBeUndefined();

  const retry = await deliver(e);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toEqual({ ok: true });
  expect((await entitlementFor(e.subscriptionId))?.status).toBe("active");
  expect((await eventRow(e.eventId))?.processedAt).toBeInstanceOf(Date);
  spy.mockRestore();
});

it("records an event for an unknown user without failing", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const e = event({ userId: "nobody" });

  const res = await deliver(e);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, unknownUser: true });
  expect(await entitlementFor(e.subscriptionId)).toBeUndefined();
  expect((await eventRow(e.eventId))?.processedAt).toBeInstanceOf(Date);
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});
