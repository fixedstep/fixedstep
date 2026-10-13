import { billingEvents, entitlements } from "@fixedstep/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { WebhookVerificationError } from "../billing/polar";
import type { AppEnv, Deps } from "../context";

export function billingRoutes({ db, billing, env }: Deps) {
  const r = new Hono<AppEnv>();

  r.post("/billing/checkout", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "sign in first" }, 401);
    const { url } = await billing.createCheckout({
      userId: user.id,
      email: user.email,
      successUrl: `${env.WEB_ORIGIN}/?checkout=success`,
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
      .values({ id: event.eventId, provider: billing.name, type: event.rawType, payload: JSON.parse(raw) })
      .onConflictDoNothing()
      .returning({ id: billingEvents.id });
    if (inserted.length === 0) return c.json({ ok: true, duplicate: true });

    if (event.type === "subscription") {
      // NOTE: last-write-wins. If out-of-order delivery becomes a problem, compare the
      // provider's modified_at before overwriting.
      const values = {
        status: event.status,
        currentPeriodEnd: event.currentPeriodEnd,
        userId: event.userId,
      };
      await db
        .insert(entitlements)
        .values({ kind: "pro", provider: billing.name, externalId: event.subscriptionId, ...values })
        .onConflictDoUpdate({ target: [entitlements.provider, entitlements.externalId], set: values });
    }
    await db
      .update(billingEvents)
      .set({ processedAt: new Date() })
      .where(eq(billingEvents.id, event.eventId));
    return c.json({ ok: true });
  });

  return r;
}
