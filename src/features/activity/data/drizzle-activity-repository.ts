import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/types";
import { activity, users } from "@/db/schema";
import { type Statement } from "@/db/atomic";
import type { ActivityAction, ActivityEntry, ActivityRepository } from "../domain/types";

/**
 * The audit-row insert as an unawaited statement. Other repositories pass it to `atomically` together with their
 * own write, so a change and its log entry are committed as one unit.
 */
export function activityInserts(db: Db, entries: ActivityEntry[]): Statement[] {
  return entries.map((e) => db.insert(activity).values({ ...e, detail: e.detail as Record<string, unknown> | null }));
}

export function createActivityRepository(db: Db): ActivityRepository {
  return {
    async listForTask(projectId, taskId, limit) {
      const rows = await db
        .select({
          id: activity.id,
          projectId: activity.projectId,
          taskId: activity.taskId,
          actorId: activity.actorId,
          action: activity.action,
          detail: activity.detail,
          createdAt: activity.createdAt,
          actorName: users.name,
        })
        .from(activity)
        .innerJoin(users, eq(users.id, activity.actorId))
        .where(and(eq(activity.projectId, projectId), eq(activity.taskId, taskId)))
        // rowid breaks ties between entries written in the same millisecond, in insertion order.
        .orderBy(desc(activity.createdAt), desc(sql`${activity}.rowid`))
        .limit(limit);
      return rows.map((r) => ({ ...r, action: r.action as ActivityAction }));
    },
  };
}
