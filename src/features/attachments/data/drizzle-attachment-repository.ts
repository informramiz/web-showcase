import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/types";
import { attachments, users } from "@/db/schema";
import type { AttachmentRepository } from "../domain/types";

export function createAttachmentRepository(db: Db): AttachmentRepository {
  return {
    async insert(attachment) {
      await db.insert(attachments).values(attachment);
    },
    async findById(projectId, id) {
      const [row] = await db
        .select()
        .from(attachments)
        .where(and(eq(attachments.projectId, projectId), eq(attachments.id, id)));
      return row;
    },
    listForTask(projectId, taskId) {
      return db
        .select({
          id: attachments.id,
          projectId: attachments.projectId,
          taskId: attachments.taskId,
          uploaderId: attachments.uploaderId,
          name: attachments.name,
          contentType: attachments.contentType,
          size: attachments.size,
          storageKey: attachments.storageKey,
          createdAt: attachments.createdAt,
          uploaderName: users.name,
        })
        .from(attachments)
        .innerJoin(users, eq(users.id, attachments.uploaderId))
        .where(and(eq(attachments.projectId, projectId), eq(attachments.taskId, taskId)))
        .orderBy(asc(attachments.createdAt), asc(sql`${attachments}.rowid`));
    },
    async delete(id) {
      await db.delete(attachments).where(eq(attachments.id, id));
    },
  };
}
