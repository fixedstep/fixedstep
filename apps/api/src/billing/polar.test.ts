import { createHmac } from "node:crypto";
import { expect, it } from "vitest";
import { verifyStandardWebhook, WebhookVerificationError } from "./polar";

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
