import { billingEvents } from "@fixedstep/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { WebhookVerificationError } from "../billing/polar";
import { BILLING_INTERVALS, type BillingInterval } from "../billing/provider";
import type { AppEnv, Deps } from "../context";
import { applySubscriptionUpdate, hasBillingAccount } from "../lib/entitlements";

export function billingRoutes({ db, billing, env }: Deps) {
  const r = new Hono<AppEnv>();

  r.post("/billing/checkout", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "sign in first" }, 401);
    if (user.isAnonymous) return c.json({ error: "create an account first", code: "guest" }, 401);
    // A verified address is known to receive mail; Polar rejects checkouts whose email domain
    // can't (422), and receipts and the customer portal link go to this address.
    if (!user.emailVerified) {
      return c.json({ error: "verify your email first", code: "email_unverified" }, 403);
    }
    const body = (await c.req.json().catch(() => ({}))) as { interval?: unknown };
    const interval = (body.interval ?? "month") as BillingInterval;
    if (!BILLING_INTERVALS.includes(interval)) return c.json({ error: "unknown interval" }, 400);
    if (!billing.supports(interval)) {
      return c.json({ error: `${interval}ly billing isn't available yet` }, 409);
    }
    const { url } = await billing.createCheckout({
      userId: user.id,
      email: user.email,
      successUrl: `${env.WEB_ORIGIN}/?checkout=success`,
      interval,
    });
    return c.json({ url });
  });

  // Any past subscriber, not only current Pro: a lapsed or past-due customer needs the portal
  // to fix their card or find invoices.
  r.post("/billing/portal", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "sign in first" }, 401);
    if (!(await hasBillingAccount(db, user.id, billing.name))) {
      return c.json({ error: "no subscription to manage" }, 404);
    }
    const { url } = await billing.createPortalSession({
      userId: user.id,
      returnUrl: `${env.WEB_ORIGIN}/`,
    });
    return c.json({ url });
  });

  r.post(`/billing/webhooks/${billing.name}`, async (c) => {
    const raw = await c.req.text();
    let event: ReturnType<typeof billing.parseWebhook>;
    try {
      event = billing.parseWebhook(raw, c.req.raw.headers);
    } catch (e) {
      if (e instanceof WebhookVerificationError) return c.json({ error: e.message }, 400);
      throw e;
    }

    // Idempotency: providers retry, so each event id is processed once.
    const inserted = await db
      .insert(billingEvents)
      .values({
        id: event.eventId,
        provider: billing.name,
        type: event.rawType,
        payload: JSON.parse(raw),
      })
      .onConflictDoNothing()
      .returning({ id: billingEvents.id });
    if (inserted.length === 0) return c.json({ ok: true, duplicate: true });

    let stale = false;
    if (event.type === "subscription") {
      stale = !(await applySubscriptionUpdate(db, billing.name, event));
    }
    await db
      .update(billingEvents)
      .set({ processedAt: new Date() })
      .where(eq(billingEvents.id, event.eventId));
    return c.json({ ok: true, ...(stale && { stale: true }) });
  });

  return r;
}
