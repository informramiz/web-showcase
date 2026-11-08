import Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { createStripeGateway } from "@/features/billing/data/stripe-gateway";
import { checkoutCompleted, CREATED, subscriptionEvent } from "../fixtures/stripe-events";

// Placeholder values only: no request ever leaves the process, every call goes to the fake fetch below.
const SECRET = "whsec_test_fixture";
const signer = new Stripe("sk_test_fixture");

interface Call {
  url: string;
  body: URLSearchParams;
}

function fakeFetch(response: object) {
  const calls: Call[] = [];
  const fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, body: new URLSearchParams(typeof init.body === "string" ? init.body : "") });
    return Promise.resolve(
      new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } }),
    );
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const gateway = (response: object = {}) => {
  const f = fakeFetch(response);
  return {
    calls: f.calls,
    gw: createStripeGateway({
      secretKey: "sk_test_fixture",
      webhookSecret: SECRET,
      priceId: "price_pro",
      fetch: f.fetch,
    }),
  };
};

const sign = (payload: string, secret = SECRET) => signer.webhooks.generateTestHeaderString({ payload, secret });

describe("Stripe gateway: webhook signature", () => {
  it("accepts a correctly signed payload", async () => {
    const payload = JSON.stringify(checkoutCompleted());
    await expect(gateway().gw.parseWebhook(payload, sign(payload))).resolves.toMatchObject({ id: "evt_checkout" });
  });

  it("rejects a payload signed with another secret", async () => {
    const payload = JSON.stringify(checkoutCompleted());
    await expect(gateway().gw.parseWebhook(payload, sign(payload, "whsec_other"))).rejects.toThrow();
  });

  it("rejects a payload changed after signing", async () => {
    const payload = JSON.stringify(checkoutCompleted());
    const tampered = payload.replace("user-1", "user-2");
    await expect(gateway().gw.parseWebhook(tampered, sign(payload))).rejects.toThrow();
  });

  it("rejects a stale signature (replay outside Stripe's tolerance)", async () => {
    const payload = JSON.stringify(checkoutCompleted());
    const old = signer.webhooks.generateTestHeaderString({
      payload,
      secret: SECRET,
      timestamp: Math.floor(Date.now() / 1000) - 3600,
    });
    await expect(gateway().gw.parseWebhook(payload, old)).rejects.toThrow();
  });
});

describe("Stripe gateway: event mapping", () => {
  const parse = (event: object) => {
    const payload = JSON.stringify(event);
    return gateway().gw.parseWebhook(payload, sign(payload));
  };

  it("maps a paid subscription checkout", async () => {
    expect(await parse(checkoutCompleted())).toEqual({
      kind: "checkout.completed",
      id: "evt_checkout",
      createdAt: new Date(CREATED * 1000),
      userId: "user-1",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      paid: true,
    });
    expect(await parse(checkoutCompleted({ payment_status: "unpaid", subscription: null }))).toMatchObject({
      paid: false,
      subscriptionId: null,
    });
  });

  it("ignores one-off payment checkouts and sessions without a customer", async () => {
    expect(await parse(checkoutCompleted({ mode: "payment" }))).toMatchObject({ kind: "ignored" });
    expect(await parse(checkoutCompleted({ customer: null }))).toMatchObject({ kind: "ignored" });
  });

  it("maps subscription created, updated and deleted", async () => {
    expect(await parse(subscriptionEvent("customer.subscription.updated"))).toEqual({
      kind: "subscription.changed",
      id: `evt_customer.subscription.updated_${String(CREATED + 10)}`,
      createdAt: new Date((CREATED + 10) * 1000),
      userId: "user-1",
      customerId: "cus_1",
      subscriptionId: "sub_1",
      status: "active",
      currentPeriodEnd: new Date((CREATED + 2_592_000) * 1000),
    });
    expect(
      await parse(subscriptionEvent("customer.subscription.deleted", { status: "canceled", metadata: {} })),
    ).toMatchObject({ status: "canceled", userId: null });
    expect(
      await parse(subscriptionEvent("customer.subscription.created", { items: { object: "list", data: [] } })),
    ).toMatchObject({ currentPeriodEnd: null });
  });

  it("ignores a subscription without a customer and unrelated event types", async () => {
    expect(await parse(subscriptionEvent("customer.subscription.updated", { customer: null }))).toMatchObject({
      kind: "ignored",
    });
    expect(await parse({ ...checkoutCompleted(), type: "invoice.paid" })).toEqual({
      kind: "ignored",
      id: "evt_checkout",
      type: "invoice.paid",
    });
  });
});

describe("Stripe gateway: sessions", () => {
  it("creates a subscription checkout for a new customer by email", async () => {
    const { gw, calls } = gateway({ id: "cs_1", object: "checkout.session", url: "https://checkout.stripe.test/cs_1" });
    const url = await gw.createCheckoutSession({
      userId: "user-1",
      email: "a@test.dev",
      customerId: null,
      successUrl: "https://app.test/ok",
      cancelUrl: "https://app.test/no",
    });
    expect(url).toBe("https://checkout.stripe.test/cs_1");
    expect(calls[0]?.url).toContain("/v1/checkout/sessions");
    const body = calls[0]!.body;
    expect(body.get("mode")).toBe("subscription");
    expect(body.get("line_items[0][price]")).toBe("price_pro");
    expect(body.get("client_reference_id")).toBe("user-1");
    expect(body.get("subscription_data[metadata][userId]")).toBe("user-1");
    expect(body.get("customer_email")).toBe("a@test.dev");
    expect(body.has("customer")).toBe(false);
  });

  it("reuses an existing customer and fails if Stripe returns no URL", async () => {
    const { gw, calls } = gateway({ id: "cs_2", object: "checkout.session", url: null });
    await expect(
      gw.createCheckoutSession({ userId: "u", email: "e", customerId: "cus_9", successUrl: "s", cancelUrl: "c" }),
    ).rejects.toThrow("without a URL");
    expect(calls[0]!.body.get("customer")).toBe("cus_9");
    expect(calls[0]!.body.has("customer_email")).toBe(false);
  });

  it("creates a customer portal session", async () => {
    const { gw, calls } = gateway({ id: "bps_1", object: "billing_portal.session", url: "https://portal.stripe.test" });
    expect(await gw.createPortalSession({ customerId: "cus_1", returnUrl: "https://app.test/projects" })).toBe(
      "https://portal.stripe.test",
    );
    expect(calls[0]?.url).toContain("/v1/billing_portal/sessions");
    expect(calls[0]!.body.get("customer")).toBe("cus_1");
    expect(calls[0]!.body.get("return_url")).toBe("https://app.test/projects");
  });
});
