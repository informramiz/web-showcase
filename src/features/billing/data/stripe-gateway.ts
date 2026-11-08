import Stripe from "stripe";
import type { BillingEvent, BillingGateway } from "../domain/types";

export interface StripeGatewayConfig {
  secretKey: string;
  webhookSecret: string;
  /** Recurring Price id for the Pro plan (price_...). */
  priceId: string;
  /** Injected in tests so no request ever reaches Stripe. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

const idOf = (ref: string | { id: string } | null | undefined): string | null =>
  ref == null ? null : typeof ref === "string" ? ref : ref.id;

const fromUnix = (seconds: number | null | undefined): Date | null => (seconds ? new Date(seconds * 1000) : null);

/**
 * Stripe adapter. Uses the fetch HTTP client and Web Crypto so it runs on Cloudflare Workers as well as Node
 * (docs.stripe.com/webhooks#verify-official-libraries, github.com/stripe/stripe-node#other-runtimes).
 */
export function createStripeGateway(config: StripeGatewayConfig): BillingGateway {
  const stripe = new Stripe(config.secretKey, {
    httpClient: Stripe.createFetchHttpClient(config.fetch),
    maxNetworkRetries: 1,
  });
  const crypto = Stripe.createSubtleCryptoProvider();

  return {
    async createCheckoutSession({ userId, email, customerId, successUrl, cancelUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: config.priceId, quantity: 1 }],
        client_reference_id: userId,
        // Copied onto the subscription so later subscription events can be matched to the user.
        subscription_data: { metadata: { userId } },
        ...(customerId ? { customer: customerId } : { customer_email: email }),
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
      if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
      return session.url;
    },

    async createPortalSession({ customerId, returnUrl }) {
      const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return session.url;
    },

    async parseWebhook(rawBody, signature): Promise<BillingEvent> {
      const event = await stripe.webhooks.constructEventAsync(
        rawBody,
        signature,
        config.webhookSecret,
        undefined,
        crypto,
      );
      const createdAt = new Date(event.created * 1000);
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const customerId = idOf(session.customer);
          if (session.mode !== "subscription" || !customerId) break;
          return {
            kind: "checkout.completed",
            id: event.id,
            createdAt,
            userId: session.client_reference_id,
            customerId,
            subscriptionId: idOf(session.subscription),
            paid: session.payment_status === "paid",
          };
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const customerId = idOf(sub.customer);
          if (!customerId) break;
          return {
            kind: "subscription.changed",
            id: event.id,
            createdAt,
            userId: sub.metadata.userId ?? null,
            customerId,
            subscriptionId: sub.id,
            status: sub.status,
            currentPeriodEnd: fromUnix(sub.items.data[0]?.current_period_end),
          };
        }
      }
      return { kind: "ignored", id: event.id, type: event.type };
    },
  };
}
