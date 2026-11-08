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
   * Applies a signed Stripe webhook. Idempotent (each event id is applied once) and order-tolerant (an event
   * older than the stored state is skipped), because Stripe retries and does not guarantee delivery order.
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
    if (!(await this.deps.subscriptions.claimEvent(event.id, event.kind, this.now()))) return;
    try {
      await (event.kind === "checkout.completed" ? this.onCheckout(event) : this.onSubscription(event));
    } catch (error) {
      await this.deps.subscriptions.releaseEvent(event.id);
      throw error;
    }
  }

  private async onCheckout(event: Extract<BillingEvent, { kind: "checkout.completed" }>): Promise<void> {
    if (!event.userId) return;
    const existing = await this.deps.subscriptions.findByUser(event.userId);
    if (existing && existing.updatedAt > event.createdAt) {
      // A newer subscription event already set the status; only fill in the link.
      await this.deps.subscriptions.upsert({ ...existing, customerId: event.customerId });
      return;
    }
    await this.deps.subscriptions.upsert({
      userId: event.userId,
      customerId: event.customerId,
      subscriptionId: event.subscriptionId ?? existing?.subscriptionId ?? null,
      status: event.paid ? "active" : (existing?.status ?? "incomplete"),
      currentPeriodEnd: existing?.currentPeriodEnd ?? null,
      updatedAt: event.createdAt,
    });
  }

  private async onSubscription(event: Extract<BillingEvent, { kind: "subscription.changed" }>): Promise<void> {
    const existing =
      (event.userId ? await this.deps.subscriptions.findByUser(event.userId) : null) ??
      (await this.deps.subscriptions.findByCustomer(event.customerId));
    const userId = existing?.userId ?? event.userId;
    if (!userId) return; // Not one of ours (e.g. created outside this app).
    if (existing && existing.updatedAt > event.createdAt) return;
    const next: Subscription = {
      userId,
      customerId: event.customerId,
      subscriptionId: event.subscriptionId,
      status: event.status,
      currentPeriodEnd: event.currentPeriodEnd,
      updatedAt: event.createdAt,
    };
    await this.deps.subscriptions.upsert(next);
  }

  private requireGateway(): BillingGateway {
    if (!this.deps.gateway) throw new AppError("not_found", "Billing is not enabled");
    return this.deps.gateway;
  }
}
