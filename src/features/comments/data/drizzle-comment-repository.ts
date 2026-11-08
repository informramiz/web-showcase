import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/types";
import { comments, users } from "@/db/schema";
import type { CommentRepository } from "../domain/types";

export function createCommentRepository(db: Db): CommentRepository {
  return {
    async insert(comment) {
      await db.insert(comments).values(comment);
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
