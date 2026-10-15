import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  BillingEvent,
  BillingInterval,
  BillingProvider,
  SubscriptionUpdate,
} from "./provider";

const API = { sandbox: "https://sandbox-api.polar.sh", production: "https://api.polar.sh" };
const TOLERANCE_SECONDS = 5 * 60;

export class WebhookVerificationError extends Error {}

/**
 * Polar via its REST API, without the SDK (the SDK's API surface is date-versioned and
 * moves quickly). Webhooks follow the Standard Webhooks spec.
 *
 * Polar products have a single recurring price, so monthly and yearly Pro are two products.
 * Both grant the same "pro" entitlement; webhooks don't care which one was bought.
 *
 * Checkout body and webhook payload fields checked against Polar's 2026-10 OpenAPI spec.
 * TODO(before launch): test end-to-end in the Polar sandbox.
 */
export function createPolarProvider(opts: {
  server: "sandbox" | "production";
  accessToken?: string;
  webhookSecret?: string;
  /** Polar product id per billing interval; an interval without one can't be bought. */
  proProductIds: Partial<Record<BillingInterval, string>>;
}): BillingProvider {
  const productFor = (interval: BillingInterval) => opts.proProductIds[interval] || undefined;
  return {
    name: "polar",

    parseWebhook(rawBody, headers) {
      if (!opts.webhookSecret) throw new WebhookVerificationError("webhook secret not configured");
      verifyStandardWebhook(rawBody, headers, opts.webhookSecret);
      const event = JSON.parse(rawBody) as { type: string; data: Record<string, unknown> };
      const eventId = headers.get("webhook-id") as string;
      return toBillingEvent(eventId, event);
    },

    supports(interval) {
      return Boolean(opts.accessToken && productFor(interval));
    },

    async createCheckout({ userId, email, successUrl, interval }) {
      const productId = productFor(interval);
      if (!opts.accessToken || !productId) {
        throw new Error(`Polar is not configured for ${interval}ly billing`);
      }
      const res = await fetch(`${API[opts.server]}/v1/checkouts/`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${opts.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          products: [productId],
          external_customer_id: userId,
          customer_email: email,
          success_url: successUrl,
        }),
      });
      if (!res.ok) throw new Error(`Polar checkout failed: ${res.status} ${await res.text()}`);
      const body = (await res.json()) as { url: string };
      return { url: body.url };
    },
  };
}

/** https://www.standardwebhooks.com — HMAC-SHA256 over `${id}.${timestamp}.${body}`. */
export function verifyStandardWebhook(
  rawBody: string,
  headers: Headers,
  secret: string,
  now = Date.now(),
) {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures) throw new WebhookVerificationError("missing headers");
  if (Math.abs(now / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
    throw new WebhookVerificationError("timestamp outside tolerance");
  }
  // "whsec_<base64>" secrets carry the key base64-encoded; Polar's plain secrets are used as
  // raw UTF-8 bytes (matching what @polar-sh/sdk's validateEvent does).
  const key = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "utf8");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest();
  const ok = signatures.split(" ").some((s) => {
    const [version, sig] = s.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw new WebhookVerificationError("bad signature");
}

// incomplete/incomplete_expired never granted access, so they're ignored. A paused
// subscription loses access until resumed (which arrives as active again).
const STATUS: Record<string, SubscriptionUpdate["status"] | undefined> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "canceled",
  paused: "revoked",
};

function toBillingEvent(
  eventId: string,
  event: { type: string; data: Record<string, unknown> },
): BillingEvent {
  const ignored = { type: "ignored", eventId, rawType: event.type } as const;
  if (!event.type.startsWith("subscription.")) return ignored;

  const data = event.data as {
    id: string;
    status: string;
    current_period_end?: string | null;
    cancel_at_period_end?: boolean;
    customer?: { external_id?: string | null };
  };
  const userId = data.customer?.external_id;
  let status = event.type === "subscription.revoked" ? "revoked" : STATUS[data.status];
  // A cancellation at period end stays "active" in Polar until subscription.revoked; record
  // it as canceled so access still ends at current_period_end if that webhook never arrives.
  if (status === "active" && data.cancel_at_period_end) status = "canceled";
  if (!userId || !status) return ignored;

  return {
    type: "subscription",
    eventId,
    rawType: event.type,
    userId,
    subscriptionId: data.id,
    status,
    currentPeriodEnd: data.current_period_end ? new Date(data.current_period_end) : null,
  };
}
