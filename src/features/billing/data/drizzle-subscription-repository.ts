import { eq, lte } from "drizzle-orm";
import { atomically } from "@/db/atomic";
import type { Db } from "@/db/types";
import { stripeEvents, subscriptions } from "@/db/schema";
import type { SubscriptionRepository } from "../domain/types";

export function createSubscriptionRepository(db: Db): SubscriptionRepository {
  return {
    async findByUser(userId) {
      const [row] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
      return row ?? null;
    },
    async findByCustomer(customerId) {
      const [row] = await db.select().from(subscriptions).where(eq(subscriptions.customerId, customerId));
      return row ?? null;
    },
    async apply(event, subscription) {
      const { customerId, subscriptionId, status, currentPeriodEnd, updatedAt } = subscription;
      await atomically(db, [
        db
          .insert(stripeEvents)
          .values({ id: event.id, type: event.type, receivedAt: event.receivedAt })
          .onConflictDoNothing(),
        db
          .insert(subscriptions)
          .values(subscription)
          .onConflictDoUpdate({
            target: subscriptions.userId,
            set: { customerId, subscriptionId, status, currentPeriodEnd, updatedAt },
            // Atomic version check: a handler that read Stripe earlier can never overwrite a later read.
            setWhere: lte(subscriptions.updatedAt, updatedAt),
          }),
      ]);
    },
  };
}
