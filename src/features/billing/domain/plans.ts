/** Plans and their limits. Pure data and rules; Stripe only decides which plan a user is on. */
export type Plan = "free" | "pro";

export interface PlanLimits {
  /** Projects the user may own. */
  ownedProjects: number;
  /** Members (owner included) in each project the user owns. */
  membersPerProject: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: { ownedProjects: 3, membersPerProject: 5 },
  pro: { ownedProjects: Number.POSITIVE_INFINITY, membersPerProject: Number.POSITIVE_INFINITY },
};

/** Used when billing is not configured: the demo stays fully usable without Stripe keys. */
export const UNLIMITED: PlanLimits = PLAN_LIMITS.pro;

/**
 * Stripe subscription statuses that keep Pro features (docs.stripe.com/billing/subscriptions/overview).
 * past_due stays Pro while Stripe retries the payment; canceled, unpaid and incomplete* fall back to Free.
 */
const PRO_STATUSES = new Set(["active", "trialing", "past_due"]);

export function planFor(status: string | null | undefined): Plan {
  return status && PRO_STATUSES.has(status) ? "pro" : "free";
}

/** Port the project domain uses to ask how much a user may create. */
export interface PlanLimitsPolicy {
  limitsFor(userId: string): Promise<PlanLimits>;
}

export const unlimitedPolicy: PlanLimitsPolicy = { limitsFor: () => Promise.resolve(UNLIMITED) };
