import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPolarProvider, verifyStandardWebhook, WebhookVerificationError } from "./polar";

const secret = "test-secret";
const body = '{"type":"subscription.active","data":{}}';
const now = 1_760_000_000_000;

function headersFor(payload: string, ts = now / 1000) {
  const sig = createHmac("sha256", Buffer.from(secret))
    .update(`msg_1.${ts}.${payload}`)
    .digest("base64");
  return new Headers({
    "webhook-id": "msg_1",
    "webhook-timestamp": String(ts),
    "webhook-signature": `v1,${sig}`,
  });
}

it("accepts a valid signature", () => {
  expect(() => verifyStandardWebhook(body, headersFor(body), secret, now)).not.toThrow();
});

it("rejects a tampered body", () => {
  expect(() => verifyStandardWebhook(`${body} `, headersFor(body), secret, now)).toThrow(
    WebhookVerificationError,
  );
});

it("rejects stale timestamps", () => {
  expect(() =>
    verifyStandardWebhook(body, headersFor(body, now / 1000 - 3600), secret, now),
  ).toThrow(/tolerance/);
});

describe("createCheckout", () => {
  afterEach(() => vi.unstubAllGlobals());

  const provider = (proProductIds: { month?: string; year?: string }) =>
    createPolarProvider({ server: "sandbox", accessToken: "tok", proProductIds });

  it("uses the product for the chosen interval", async () => {
    const fetch = vi.fn(async () => Response.json({ url: "https://polar.test/c/1" }));
    vi.stubGlobal("fetch", fetch);
    const p = provider({ month: "prod_month", year: "prod_year" });
    const opts = { userId: "u1", email: "a@b.c", successUrl: "https://x/" };

    await p.createCheckout({ ...opts, interval: "year" });
    await p.createCheckout({ ...opts, interval: "month" });

    const products = fetch.mock.calls.map(
      (call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).products,
    );
    expect(products).toEqual([["prod_year"], ["prod_month"]]);
  });

  it("opens a portal session for our user id", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ customer_portal_url: "https://polar.test/portal/1" }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetch);

    const { url } = await provider({}).createPortalSession({
      userId: "u1",
      returnUrl: "https://x/",
    });

    const [endpoint, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe("https://sandbox-api.polar.sh/v1/customer-sessions/");
    expect(JSON.parse(String(init.body))).toEqual({
      external_customer_id: "u1",
      return_url: "https://x/",
    });
    expect(url).toBe("https://polar.test/portal/1");
  });

  it("reports an interval without a product as unsupported", () => {
    const p = provider({ month: "prod_month", year: "" });
    expect(p.supports("month")).toBe(true);
    expect(p.supports("year")).toBe(false);
  });
});

describe("parseWebhook", () => {
  const p = createPolarProvider({ server: "sandbox", webhookSecret: secret, proProductIds: {} });
  const parse = (type: string, data: Record<string, unknown>) => {
    const payload = JSON.stringify({ type, data });
    const ts = Math.floor(Date.now() / 1000);
    return p.parseWebhook(payload, headersFor(payload, ts));
  };
  const sub = (fields: Record<string, unknown>) => ({
    id: "sub_1",
    status: "active",
    current_period_end: "2026-11-01T00:00:00Z",
    cancel_at_period_end: false,
    customer: { external_id: "u1" },
    ...fields,
  });

  it("maps an active subscription to our user", () => {
    expect(parse("subscription.active", sub({}))).toMatchObject({
      type: "subscription",
      userId: "u1",
      subscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: new Date("2026-11-01T00:00:00Z"),
    });
  });

  it("treats cancel-at-period-end as canceled so access ends at the period end", () => {
    expect(parse("subscription.canceled", sub({ cancel_at_period_end: true }))).toMatchObject({
      status: "canceled",
    });
  });

  it("revokes access while paused", () => {
    expect(parse("subscription.paused", sub({ status: "paused" }))).toMatchObject({
      status: "revoked",
    });
  });

  it("ignores incomplete subscriptions, missing users and non-subscription events", () => {
    expect(parse("subscription.created", sub({ status: "incomplete" })).type).toBe("ignored");
    expect(parse("subscription.active", sub({ customer: {} })).type).toBe("ignored");
    expect(parse("order.paid", {}).type).toBe("ignored");
  });
});
