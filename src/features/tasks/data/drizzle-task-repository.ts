import { and, asc, count, eq, isNull, max, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/types";
import { tasks } from "@/db/schema";
import type { TaskFilter, TaskRepository } from "../domain/types";

/** Escapes LIKE wildcards so a search for "50%" matches the literal text. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const statusOrder = sql`case ${tasks.status} when 'todo' then 0 when 'in_progress' then 1 else 2 end`;

function whereFor(projectId: string, f: TaskFilter): SQL | undefined {
  const conds: (SQL | undefined)[] = [eq(tasks.projectId, projectId)];
  if (f.status) conds.push(eq(tasks.status, f.status));
  if (f.assigneeId === "unassigned") conds.push(isNull(tasks.assigneeId));
  else if (f.assigneeId) conds.push(eq(tasks.assigneeId, f.assigneeId));
  if (f.search) {
    // SQLite LIKE is case-insensitive for ASCII.
    const pattern = `%${escapeLike(f.search)}%`;
    conds.push(
      or(sql`${tasks.title} like ${pattern} escape '\\'`, sql`${tasks.description} like ${pattern} escape '\\'`),
    );
  }
  return and(...conds);
}

export function createTaskRepository(db: Db): TaskRepository {
  return {
    async insert(task) {
      await db.insert(tasks).values(task);
    },
    async findById(projectId, id) {
      const [row] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.id, id)))
        .limit(1);
      return row ?? null;
    },
    async list(projectId, filter, offset, limit) {
      const where = whereFor(projectId, filter);
      const items = await db
        .select()
        .from(tasks)
        .where(where)
        .orderBy(statusOrder, asc(tasks.position), asc(tasks.createdAt))
        .limit(limit)
        .offset(offset);
      const [totalRow] = await db.select({ n: count() }).from(tasks).where(where);
      return { items, total: totalRow?.n ?? 0 };
    },
    async update(projectId, id, patch) {
      await db
        .update(tasks)
        .set(patch)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.id, id)));
    },
    async delete(projectId, id) {
      await db.delete(tasks).where(and(eq(tasks.projectId, projectId), eq(tasks.id, id)));
    },
    async maxPosition(projectId, status) {
      const [row] = await db
        .select({ m: max(tasks.position) })
        .from(tasks)
        .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status)));
      return row?.m ?? 0;
    },
  };
}
