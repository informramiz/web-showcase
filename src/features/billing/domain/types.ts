/** What we keep about a user's Stripe subscription. Stripe stays the source of truth; webhooks keep this in sync. */
export interface Subscription {
  userId: string;
  customerId: string;
  subscriptionId: string | null;
  /** Stripe subscription status, e.g. active, past_due, canceled. */
  status: string;
  currentPeriodEnd: Date | null;
  /** Time of the Stripe event that produced this state; older events are ignored. */
  updatedAt: Date;
}

export interface SubscriptionRepository {
  findByUser(userId: string): Promise<Subscription | null>;
  findByCustomer(customerId: string): Promise<Subscription | null>;
  upsert(subscription: Subscription): Promise<void>;
  /** Records a Stripe event id; false if it was already recorded (Stripe delivers at least once). */
  claimEvent(eventId: string, type: string, receivedAt: Date): Promise<boolean>;
  /** Forgets a claimed event whose handling failed, so Stripe's retry is applied. */
  releaseEvent(eventId: string): Promise<void>;
}

/** Stripe events reduced to what the domain needs. Everything else is "ignored". */
export type BillingEvent =
  | {
      kind: "checkout.completed";
      id: string;
      createdAt: Date;
      userId: string | null;
      customerId: string;
      subscriptionId: string | null;
      paid: boolean;
    }
  | {
      kind: "subscription.changed";
      id: string;
      createdAt: Date;
      /** From subscription metadata, set at checkout. */
      userId: string | null;
      customerId: string;
      subscriptionId: string;
      status: string;
      currentPeriodEnd: Date | null;
    }
  | { kind: "ignored"; id: string; type: string };

/** Outbound port to the payment provider. */
export interface BillingGateway {
  createCheckoutSession(input: {
    userId: string;
    email: string;
    customerId: string | null;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string>;
  createPortalSession(input: { customerId: string; returnUrl: string }): Promise<string>;
  /** Verifies the signature over the raw body and parses the event; throws on a bad signature. */
  parseWebhook(rawBody: string, signature: string): Promise<BillingEvent>;
}
