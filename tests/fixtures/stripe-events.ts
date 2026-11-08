/** Trimmed Stripe webhook payloads (API shape from docs.stripe.com/api/events), enough for the gateway mapping. */
export const CREATED = 1_760_000_000;

export const checkoutCompleted = (over: Record<string, unknown> = {}) => ({
  id: "evt_checkout",
  object: "event",
  type: "checkout.session.completed",
  created: CREATED,
  data: {
    object: {
      id: "cs_test_1",
      object: "checkout.session",
      mode: "subscription",
      customer: "cus_1",
      subscription: "sub_1",
      client_reference_id: "user-1",
      payment_status: "paid",
      ...over,
    },
  },
});

export const subscriptionEvent = (
  type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted",
  over: Record<string, unknown> = {},
  created = CREATED + 10,
) => ({
  id: `evt_${type}_${String(created)}`,
  object: "event",
  type,
  created,
  data: {
    object: {
      id: "sub_1",
      object: "subscription",
      customer: { id: "cus_1", object: "customer" },
      status: "active",
      metadata: { userId: "user-1" },
      items: { object: "list", data: [{ id: "si_1", current_period_end: CREATED + 2_592_000 }] },
      ...over,
    },
  },
});
