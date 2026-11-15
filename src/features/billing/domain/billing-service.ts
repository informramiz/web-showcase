import { AppError } from "@/core/errors";
import type { User } from "@/features/auth/domain/types";
import { PLAN_LIMITS, planFor, UNLIMITED, type Plan, type PlanLimits, type PlanLimitsPolicy } from "./plans";
import type { BillingGateway, BillingEvent, Subscription, SubscriptionRepository } from "./types";

export interface BillingDeps {
  subscriptions: SubscriptionRepository;
  /** Null when Stripe keys are not configured: billing is off and nobody is limited. */
  gateway: BillingGateway | null;
  now?: () => Date;
}

export type BillingStatus =
  | { enabled: false }
  | {
      enabled: true;
      plan: Plan;
      status: string | null;
      currentPeriodEnd: string | null;
      limits: { ownedProjects: number | null; membersPerProject: number | null };
      canManage: boolean;
    };

const finiteOrNull = (n: number) => (Number.isFinite(n) ? n : null);

/** Plans, checkout, portal and the webhook that keeps subscription state in step with Stripe. */
export class BillingService implements PlanLimitsPolicy {
  private readonly now: () => Date;

  constructor(private readonly deps: BillingDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  get enabled(): boolean {
    return this.deps.gateway !== null;
  }

  async limitsFor(userId: string): Promise<PlanLimits> {
    if (!this.enabled) return UNLIMITED;
    const sub = await this.deps.subscriptions.findByUser(userId);
    return PLAN_LIMITS[planFor(sub?.status)];
  }

  async status(actor: User): Promise<BillingStatus> {
    if (!this.enabled) return { enabled: false };
    const sub = await this.deps.subscriptions.findByUser(actor.id);
    const plan = planFor(sub?.status);
    const limits = PLAN_LIMITS[plan];
    return {
      enabled: true,
      plan,
      status: sub?.status ?? null,
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      limits: {
        ownedProjects: finiteOrNull(limits.ownedProjects),
        membersPerProject: finiteOrNull(limits.membersPerProject),
      },
      canManage: Boolean(sub),
    };
  }

  /** Returns the Stripe Checkout URL for the Pro subscription. */
  async checkout(actor: User, origin: string): Promise<string> {
    const gateway = this.requireGateway();
    const sub = await this.deps.subscriptions.findByUser(actor.id);
    if (planFor(sub?.status) === "pro") throw new AppError("conflict", "You are already on Pro");
    return gateway.createCheckoutSession({
      userId: actor.id,
      email: actor.email,
      customerId: sub?.customerId ?? null,
      successUrl: `${origin}/projects?billing=success`,
      cancelUrl: `${origin}/projects?billing=cancelled`,
    });
  }

  /** Returns a Stripe customer portal URL, where the user changes card, cancels or resubscribes. */
  async portal(actor: User, origin: string): Promise<string> {
    const gateway = this.requireGateway();
    const sub = await this.deps.subscriptions.findByUser(actor.id);
    if (!sub) throw new AppError("conflict", "No subscription yet");
    return gateway.createPortalSession({ customerId: sub.customerId, returnUrl: `${origin}/projects` });
  }

  /**
   * Applies a signed Stripe webhook. Stripe retries and does not guarantee delivery order, and `created` only has
   * one-second resolution, so the event is treated as a "something changed" signal: the subscription's current
   * state is read back from Stripe and written with its read time. Replays and reordered events therefore converge
   * on Stripe's latest state, and the event id is recorded in the same atomic write as the state it caused.
   */
  async handleWebhook(rawBody: string, signature: string | null): Promise<void> {
    const gateway = this.requireGateway();
    if (!signature) throw new AppError("validation", "Missing Stripe-Signature header");
    let event: BillingEvent;
    try {
      event = await gateway.parseWebhook(rawBody, signature);
    } catch {
      throw new AppError("validation", "Invalid webhook signature");
    }
    if (event.kind === "ignored") return;
    const type = event.kind;
    const next =
      event.kind === "checkout.completed"
        ? await this.onCheckout(gateway, event)
        : await this.onSubscription(gateway, event);
    if (next) await this.deps.subscriptions.apply({ id: event.id, type, receivedAt: this.now() }, next);
  }

  /** The state to store for a subscription id: Stripe's current one, or `canceled` when Stripe no longer has it. */
  private async currentState(gateway: BillingGateway, subscriptionId: string) {
    const remote = await gateway.retrieveSubscription(subscriptionId);
    return remote ?? { status: "canceled", currentPeriodEnd: null };
  }

  private async onCheckout(
    gateway: BillingGateway,
    event: Extract<BillingEvent, { kind: "checkout.completed" }>,
  ): Promise<Subscription | null> {
    if (!event.userId) return null;
    const existing = await this.deps.subscriptions.findByUser(event.userId);
    const subscriptionId = event.subscriptionId ?? existing?.subscriptionId ?? null;
    const readAt = this.now();
    const state = subscriptionId
      ? await this.currentState(gateway, subscriptionId)
      : {
          status: event.paid ? "active" : (existing?.status ?? "incomplete"),
          currentPeriodEnd: existing?.currentPeriodEnd ?? null,
        };
    return {
      userId: event.userId,
      customerId: event.customerId,
      subscriptionId,
      status: state.status,
      currentPeriodEnd: state.currentPeriodEnd,
      updatedAt: readAt,
    };
  }

  private async onSubscription(
    gateway: BillingGateway,
    event: Extract<BillingEvent, { kind: "subscription.changed" }>,
  ): Promise<Subscription | null> {
    const existing =
      (event.userId ? await this.deps.subscriptions.findByUser(event.userId) : null) ??
      (await this.deps.subscriptions.findByCustomer(event.customerId));
    const userId = existing?.userId ?? event.userId;
    if (!userId) return null; // Not one of ours (e.g. created outside this app).
    // Taken before the read, so a handler that started reading earlier never carries a later time.
    const readAt = this.now();
    const state = await this.currentState(gateway, event.subscriptionId);
    // A user who re-subscribed (sub_2) keeps Pro when sub_1 later reports canceled: only a Pro-granting state may
    // replace the subscription the row currently follows.
    const other = existing?.subscriptionId && existing.subscriptionId !== event.subscriptionId;
    if (other && planFor(existing.status) === "pro" && planFor(state.status) !== "pro") return null;
    return {
      userId,
      customerId: event.customerId,
      subscriptionId: event.subscriptionId,
      status: state.status,
      currentPeriodEnd: state.currentPeriodEnd,
      updatedAt: readAt,
    };
  }

  private requireGateway(): BillingGateway {
    if (!this.deps.gateway) throw new AppError("not_found", "Billing is not enabled");
    return this.deps.gateway;
  }
}
