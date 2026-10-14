/**
 * Billing is behind this interface so the merchant of record can be swapped (Polar today;
 * maybe plain Stripe later). Providers translate their webhooks into BillingEvents; the
 * app only ever reads the `entitlements` table.
 */
export type SubscriptionUpdate = {
  type: "subscription";
  eventId: string;
  rawType: string;
  /** Our user id, passed to the provider at checkout. */
  userId: string;
  subscriptionId: string;
  status: "active" | "canceled" | "past_due" | "revoked";
  currentPeriodEnd: Date | null;
};

export type BillingInterval = "month" | "year";
export const BILLING_INTERVALS: readonly BillingInterval[] = ["month", "year"];

export type BillingEvent =
  | SubscriptionUpdate
  | { type: "ignored"; eventId: string; rawType: string };

export interface BillingProvider {
  readonly name: string;
  /** Verifies the signature and parses the event. Throws on an invalid signature. */
  parseWebhook(rawBody: string, headers: Headers): BillingEvent;
  /** Whether a Pro plan is configured for this billing interval. */
  supports(interval: BillingInterval): boolean;
  createCheckout(opts: {
    userId: string;
    email: string;
    successUrl: string;
    interval: BillingInterval;
  }): Promise<{ url: string }>;
}
