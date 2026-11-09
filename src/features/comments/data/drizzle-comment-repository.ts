import { and, asc, eq, sql } from "drizzle-orm";
import { atomically } from "@/db/atomic";
import type { Db } from "@/db/types";
import { activityInserts } from "@/features/activity/data/drizzle-activity-repository";
import { comments, users } from "@/db/schema";
import type { CommentRepository } from "../domain/types";

export function createCommentRepository(db: Db): CommentRepository {
  return {
    async insert(comment, entries) {
      await atomically(db, [db.insert(comments).values(comment), ...activityInserts(db, entries)]);
    },
    listForTask(projectId, taskId) {
      return db
        .select({
          id: comments.id,
          projectId: comments.projectId,
          taskId: comments.taskId,
          authorId: comments.authorId,
          body: comments.body,
          createdAt: comments.createdAt,
          authorName: users.name,
        })
        .from(comments)
        .innerJoin(users, eq(users.id, comments.authorId))
        .where(and(eq(comments.projectId, projectId), eq(comments.taskId, taskId)))
        .orderBy(asc(comments.createdAt), asc(sql`${comments}.rowid`));
    },
  };
}
