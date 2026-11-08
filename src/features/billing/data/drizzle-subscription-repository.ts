import { eq } from "drizzle-orm";
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
    async upsert(subscription) {
      const { customerId, subscriptionId, status, currentPeriodEnd, updatedAt } = subscription;
      await db
        .insert(subscriptions)
        .values(subscription)
        .onConflictDoUpdate({
          target: subscriptions.userId,
          set: { customerId, subscriptionId, status, currentPeriodEnd, updatedAt },
        });
    },
    async claimEvent(eventId, type, receivedAt) {
      const inserted = await db
        .insert(stripeEvents)
        .values({ id: eventId, type, receivedAt })
        .onConflictDoNothing()
        .returning({ id: stripeEvents.id });
      return inserted.length > 0;
    },
    async releaseEvent(eventId) {
      await db.delete(stripeEvents).where(eq(stripeEvents.id, eventId));
    },
  };
}
