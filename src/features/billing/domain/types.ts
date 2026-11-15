/** What we keep about a user's Stripe subscription. Stripe stays the source of truth; webhooks keep this in sync. */
export interface Subscription {
  userId: string;
  customerId: string;
  subscriptionId: string | null;
  /** Stripe subscription status, e.g. active, past_due, canceled. */
  status: string;
  currentPeriodEnd: Date | null;
  /** When this state was read from Stripe; a write carrying an older time never replaces a newer row. */
  updatedAt: Date;
}

export interface SubscriptionRepository {
  findByUser(userId: string): Promise<Subscription | null>;
  findByCustomer(customerId: string): Promise<Subscription | null>;
  /**
   * Stores the new state and records the Stripe event id in one atomic write, so a crash can never leave an
   * event marked handled without its effect. A row whose `updatedAt` is newer than the incoming one is kept.
   */
  apply(event: { id: string; type: string; receivedAt: Date }, subscription: Subscription): Promise<void>;
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

export interface RemoteSubscription {
  customerId: string;
  status: string;
  currentPeriodEnd: Date | null;
}

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
  /**
   * Current state of a subscription straight from Stripe, or null when it no longer exists. Webhooks only say
   * "something changed": Stripe does not guarantee delivery order and `created` has one-second resolution, so the
   * state is always read back instead of being taken from the event.
   */
  retrieveSubscription(subscriptionId: string): Promise<RemoteSubscription | null>;
}
