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

  it("reports an interval without a product as unsupported", () => {
    const p = provider({ month: "prod_month", year: "" });
    expect(p.supports("month")).toBe(true);
    expect(p.supports("year")).toBe(false);
  });
});
