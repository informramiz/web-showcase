import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import * as statusRoute from "@/app/api/billing/route";
import * as checkoutRoute from "@/app/api/billing/checkout/route";
import * as portalRoute from "@/app/api/billing/portal/route";
import * as webhookRoute from "@/app/api/billing/webhook/route";
import { SESSION_COOKIE } from "@/features/auth/server/cookie";
import type { BillingEvent, BillingGateway } from "@/features/billing/domain/types";
import { setContainer } from "@/server/runtime";
import { makeWorld, type World } from "../helpers/setup";

const T0 = new Date("2026-01-01T00:00:00Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

/**
 * Stands in for Stripe. The "signature" is the event id prefixed with "sig:", so tests drive the domain with
 * typed events; real signature verification is covered against the Stripe SDK in stripe-gateway.test.ts.
 */
class FakeGateway implements BillingGateway {
  readonly events = new Map<string, BillingEvent>();
  readonly checkouts: Parameters<BillingGateway["createCheckoutSession"]>[0][] = [];

  createCheckoutSession(input: Parameters<BillingGateway["createCheckoutSession"]>[0]) {
    this.checkouts.push(input);
    return Promise.resolve("https://checkout.stripe.test/session");
  }
  createPortalSession({ customerId }: { customerId: string; returnUrl: string }) {
    return Promise.resolve(`https://portal.stripe.test/${customerId}`);
  }
  parseWebhook(_raw: string, signature: string) {
    const event = this.events.get(signature.replace(/^sig:/, ""));
    return event ? Promise.resolve(event) : Promise.reject(new Error("No signatures found matching"));
  }
  /** Registers an event and returns the signature header for it. */
  sign(event: BillingEvent): string {
    this.events.set(event.id, event);
    return `sig:${event.id}`;
  }
}

const checkout = (userId: string, over: Partial<BillingEvent & { kind: "checkout.completed" }> = {}): BillingEvent => ({
  kind: "checkout.completed",
  id: "evt_co",
  createdAt: at(0),
  userId,
  customerId: "cus_1",
  subscriptionId: "sub_1",
  paid: true,
  ...over,
});

const subChanged = (
  id: string,
  status: string,
  createdAt: Date,
  over: Partial<BillingEvent & { kind: "subscription.changed" }> = {},
): BillingEvent => ({
  kind: "subscription.changed",
  id,
  createdAt,
  userId: null,
  customerId: "cus_1",
  subscriptionId: "sub_1",
  status,
  currentPeriodEnd: at(2_592_000),
  ...over,
});

async function billingWorld(): Promise<World & { gw: FakeGateway; deliver: (e: BillingEvent) => Promise<void> }> {
  const gw = new FakeGateway();
  const w = await makeWorld({ billing: gw });
  return { ...w, gw, deliver: (e) => w.c.billing.handleWebhook("{}", gw.sign(e)) };
}

describe("billing disabled (no Stripe keys)", () => {
  it("reports disabled, applies no limits and refuses checkout, portal and webhooks", async () => {
    const w = await makeWorld();
    expect(await w.c.billing.status(w.owner)).toEqual({ enabled: false });
    for (let i = 0; i < 5; i++) await w.c.projects.create(w.owner, { name: `P${String(i)}` });
    await expect(w.c.billing.checkout(w.owner, "https://app.test")).rejects.toMatchObject({ kind: "not_found" });
    await expect(w.c.billing.portal(w.owner, "https://app.test")).rejects.toMatchObject({ kind: "not_found" });
    await expect(w.c.billing.handleWebhook("{}", "sig")).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("plan limits", () => {
  it("caps a Free owner at 3 projects with payment_required", async () => {
    const w = await billingWorld(); // makeWorld already created one project for the owner
    await w.c.projects.create(w.owner, { name: "Two" });
    await w.c.projects.create(w.owner, { name: "Three" });
    await expect(w.c.projects.create(w.owner, { name: "Four" })).rejects.toMatchObject({
      kind: "payment_required",
    });
    // Being a member elsewhere does not count against your own limit.
    await w.c.projects.create(w.member, { name: "Mine" });
  });

  it("caps members per project by the owner's plan, and Pro lifts both limits", async () => {
    const w = await billingWorld(); // owner + member = 2
    const extra = await Promise.all(
      ["A", "B", "C", "D"].map(
        async (n) => (await w.c.auth.register({ name: n, email: `${n}@x.dev`, password: "password1" })).user,
      ),
    );
    for (const u of extra.slice(0, 3)) await w.c.projects.addMember(w.owner, w.projectId, { email: u.email });
    await expect(w.c.projects.addMember(w.owner, w.projectId, { email: extra[3]!.email })).rejects.toMatchObject({
      kind: "payment_required",
    });

    await w.deliver(checkout(w.owner.id));
    await w.c.projects.addMember(w.owner, w.projectId, { email: extra[3]!.email });
    for (let i = 0; i < 4; i++) await w.c.projects.create(w.owner, { name: `Pro ${String(i)}` });
  });
});

describe("webhook state transitions", () => {
  it("checkout paid makes the user Pro and links the customer", async () => {
    const w = await billingWorld();
    expect(await w.c.billing.status(w.owner)).toMatchObject({
      plan: "free",
      canManage: false,
      limits: { ownedProjects: 3 },
    });
    await w.deliver(checkout(w.owner.id));
    expect(await w.c.billing.status(w.owner)).toMatchObject({
      enabled: true,
      plan: "pro",
      status: "active",
      canManage: true,
      limits: { ownedProjects: null, membersPerProject: null },
    });
  });

  it("an unpaid checkout records the customer but stays Free", async () => {
    const w = await billingWorld();
    await w.deliver(checkout(w.owner.id, { paid: false, subscriptionId: null }));
    expect(await w.c.billing.status(w.owner)).toMatchObject({ plan: "free", status: "incomplete", canManage: true });
  });

  it("a checkout without a user reference is ignored", async () => {
    const w = await billingWorld();
    await w.deliver(checkout(w.owner.id, { userId: null }));
    expect(await w.c.billing.status(w.owner)).toMatchObject({ canManage: false });
  });

  it("subscription updates follow the customer: past_due keeps Pro, canceled drops to Free", async () => {
    const w = await billingWorld();
    await w.deliver(checkout(w.owner.id));
    await w.deliver(subChanged("evt_1", "past_due", at(10)));
    expect(await w.c.billing.status(w.owner)).toMatchObject({
      plan: "pro",
      status: "past_due",
      currentPeriodEnd: at(2_592_000).toISOString(),
    });
    await w.deliver(subChanged("evt_2", "canceled", at(20)));
    expect(await w.c.billing.status(w.owner)).toMatchObject({ plan: "free", status: "canceled" });
  });

  it("a subscription event can arrive before checkout.completed (matched by metadata userId)", async () => {
    const w = await billingWorld();
    await w.deliver(subChanged("evt_sub", "active", at(10), { userId: w.owner.id }));
    expect(await w.c.billing.status(w.owner)).toMatchObject({ plan: "pro" });
    // The older checkout event must not overwrite the newer status, only keep the link.
    await w.deliver(checkout(w.owner.id, { paid: false, createdAt: at(0) }));
    expect(await w.c.billing.status(w.owner)).toMatchObject({ plan: "pro", status: "active" });
  });

  it("skips an older event delivered after a newer one", async () => {
    const w = await billingWorld();
    await w.deliver(checkout(w.owner.id));
    await w.deliver(subChanged("evt_new", "canceled", at(20)));
    await w.deliver(subChanged("evt_old", "active", at(10)));
    expect(await w.c.billing.status(w.owner)).toMatchObject({ status: "canceled" });
  });

  it("applies a duplicate delivery once", async () => {
    const w = await billingWorld();
    await w.deliver(checkout(w.owner.id));
    await w.deliver(subChanged("evt_cancel", "canceled", at(20)));
    // Re-subscribe through a newer event, then Stripe redelivers the old cancel with the same id.
    await w.deliver(subChanged("evt_again", "active", at(30)));
    await w.deliver(subChanged("evt_cancel", "canceled", at(40)));
    expect(await w.c.billing.status(w.owner)).toMatchObject({ status: "active" });
  });

  it("ignores subscriptions that belong to nobody here and events it does not handle", async () => {
    const w = await billingWorld();
    await w.deliver(subChanged("evt_foreign", "active", at(10), { customerId: "cus_other" }));
    await w.deliver({ kind: "ignored", id: "evt_inv", type: "invoice.paid" });
    expect(await w.c.billing.status(w.owner)).toMatchObject({ canManage: false });
  });

  it("releases the claim when applying fails, so Stripe's retry is applied", async () => {
    const w = await billingWorld();
    const event = checkout(w.owner.id, { userId: "no-such-user" }); // FK violation on insert
    await expect(w.deliver(event)).rejects.toThrow();
    w.gw.events.set(event.id, { ...event, userId: w.owner.id } as BillingEvent);
    await w.c.billing.handleWebhook("{}", `sig:${event.id}`);
    expect(await w.c.billing.status(w.owner)).toMatchObject({ plan: "pro" });
  });

  it("rejects a missing or invalid signature as a validation error", async () => {
    const w = await billingWorld();
    await expect(w.c.billing.handleWebhook("{}", null)).rejects.toMatchObject({ kind: "validation" });
    await expect(w.c.billing.handleWebhook("{}", "sig:forged")).rejects.toMatchObject({ kind: "validation" });
  });
});

describe("checkout and portal", () => {
  it("starts checkout for a Free user, reusing the customer once known", async () => {
    const w = await billingWorld();
    expect(await w.c.billing.checkout(w.owner, "https://app.test")).toBe("https://checkout.stripe.test/session");
    expect(w.gw.checkouts[0]).toEqual({
      userId: w.owner.id,
      email: w.owner.email,
      customerId: null,
      successUrl: "https://app.test/projects?billing=success",
      cancelUrl: "https://app.test/projects?billing=cancelled",
    });
    await w.deliver(checkout(w.owner.id, { paid: false }));
    await w.c.billing.checkout(w.owner, "https://app.test");
    expect(w.gw.checkouts[1]).toMatchObject({ customerId: "cus_1" });
  });

  it("refuses checkout when already Pro and the portal before any subscription", async () => {
    const w = await billingWorld();
    await expect(w.c.billing.portal(w.owner, "https://app.test")).rejects.toMatchObject({ kind: "conflict" });
    await w.deliver(checkout(w.owner.id));
    await expect(w.c.billing.checkout(w.owner, "https://app.test")).rejects.toMatchObject({ kind: "conflict" });
    expect(await w.c.billing.portal(w.owner, "https://app.test")).toBe("https://portal.stripe.test/cus_1");
  });
});

describe("billing routes", () => {
  afterEach(() => setContainer(undefined));

  const token = async (w: World) => (await w.c.auth.login({ email: w.owner.email, password: "password1" })).token;
  const req = (
    path: string,
    init: { method?: string; token?: string; headers?: Record<string, string>; body?: string },
  ) =>
    new NextRequest(`http://localhost${path}`, {
      method: init.method ?? "GET",
      headers: { ...(init.token ? { cookie: `${SESSION_COOKIE}=${init.token}` } : {}), ...init.headers },
      body: init.body,
    });
  const ctx = { params: Promise.resolve({}) };

  it("serves status uncached and requires a session", async () => {
    const w = await billingWorld();
    setContainer(w.c);
    expect((await statusRoute.GET(req("/api/billing", {}), ctx)).status).toBe(401);
    const res = await statusRoute.GET(req("/api/billing", { token: await token(w) }), ctx);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ enabled: true, plan: "free" });
  });

  it("returns checkout and portal URLs, with 409 when not applicable", async () => {
    const w = await billingWorld();
    setContainer(w.c);
    const t = await token(w);
    const co = await checkoutRoute.POST(req("/api/billing/checkout", { method: "POST", token: t }), ctx);
    expect(await co.json()).toEqual({ url: "https://checkout.stripe.test/session" });
    expect((await portalRoute.POST(req("/api/billing/portal", { method: "POST", token: t }), ctx)).status).toBe(409);
    await w.deliver(checkout(w.owner.id));
    const portal = await portalRoute.POST(req("/api/billing/portal", { method: "POST", token: t }), ctx);
    expect(await portal.json()).toEqual({ url: "https://portal.stripe.test/cus_1" });
  });

  it("webhook: 200 on a signed event, 400 on a bad or missing signature", async () => {
    const w = await billingWorld();
    setContainer(w.c);
    const sig = w.gw.sign(checkout(w.owner.id));
    const ok = await webhookRoute.POST(
      req("/api/billing/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": sig } }),
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ received: true });
    const bad = await webhookRoute.POST(
      req("/api/billing/webhook", { method: "POST", body: "{}", headers: { "stripe-signature": "sig:nope" } }),
    );
    expect(bad.status).toBe(400);
    expect((await webhookRoute.POST(req("/api/billing/webhook", { method: "POST", body: "{}" }))).status).toBe(400);
  });

  it("maps a plan limit to 402 on the JSON API", async () => {
    const { errorResponse } = await import("@/server/http");
    const { AppError } = await import("@/core/errors");
    expect(errorResponse(new AppError("payment_required", "Upgrade")).status).toBe(402);
  });
});
