import { createHmac, timingSafeEqual } from "node:crypto";
import type { BillingEvent, BillingProvider, SubscriptionUpdate } from "./provider";

const API = { sandbox: "https://sandbox-api.polar.sh", production: "https://api.polar.sh" };
const TOLERANCE_SECONDS = 5 * 60;

export class WebhookVerificationError extends Error {}

/**
 * Polar via its REST API, without the SDK (the SDK's API surface is date-versioned and
 * moves quickly). Webhooks follow the Standard Webhooks spec.
 *
 * TODO(before launch): verify the checkout request body and webhook payload field names
 * against the Polar API version you pin, and test end-to-end in the Polar sandbox.
 */
export function createPolarProvider(opts: {
  server: "sandbox" | "production";
  accessToken?: string;
  webhookSecret?: string;
  proProductId?: string;
}): BillingProvider {
  return {
    name: "polar",

    parseWebhook(rawBody, headers) {
      if (!opts.webhookSecret) throw new WebhookVerificationError("webhook secret not configured");
      verifyStandardWebhook(rawBody, headers, opts.webhookSecret);
      const event = JSON.parse(rawBody) as { type: string; data: Record<string, unknown> };
      const eventId = headers.get("webhook-id") as string;
      return toBillingEvent(eventId, event);
    },

    async createCheckout({ userId, email, successUrl }) {
      if (!opts.accessToken || !opts.proProductId) throw new Error("Polar is not configured");
      const res = await fetch(`${API[opts.server]}/v1/checkouts/`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${opts.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          products: [opts.proProductId],
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

const STATUS: Record<string, SubscriptionUpdate["status"] | undefined> = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "canceled",
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
    customer?: { external_id?: string | null };
  };
  const userId = data.customer?.external_id;
  const status = event.type === "subscription.revoked" ? "revoked" : STATUS[data.status];
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
