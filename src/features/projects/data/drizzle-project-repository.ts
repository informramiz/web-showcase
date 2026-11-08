import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/types";
import { projectMembers, projects, tasks, users } from "@/db/schema";
import type { ProjectRepository, Role } from "../domain/types";

/**
 * INSERT ... SELECT ... WHERE <count> < limit: the count and the insert are one statement, which SQLite and D1
 * run atomically. Returns false when the limit refused the row. An infinite limit is a plain insert.
 */
async function insertMemberWithin(
  db: Db,
  projectId: string,
  userId: string,
  role: Role,
  current: SQL,
  limit: number,
): Promise<boolean> {
  if (!Number.isFinite(limit)) {
    await db.insert(projectMembers).values({ projectId, userId, role });
    return true;
  }
  const inserted = await db
    .insert(projectMembers)
    .select(sql`select ${projectId}, ${userId}, ${role} where ${current} < ${limit}`)
    .returning({ userId: projectMembers.userId });
  return inserted.length > 0;
}

export function createProjectRepository(db: Db): ProjectRepository {
  return {
    async insert(project, ownerId, maxOwned) {
      // D1 has no interactive transactions, so the limit is checked inside the owner-row INSERT itself: one
      // statement, so two concurrent creates can't both pass a count taken beforehand. A project without its
      // owner row is invisible to everyone; it is removed when the limit refuses the owner row.
      await db.insert(projects).values(project);
      const ownerCount = sql`(select count(*) from ${projectMembers} where ${projectMembers.userId} = ${ownerId} and ${projectMembers.role} = 'owner')`;
      if (await insertMemberWithin(db, project.id, ownerId, "owner", ownerCount, maxOwned)) return true;
      await db.delete(projects).where(eq(projects.id, project.id));
      return false;
    },
    async findById(id) {
      const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      return row ?? null;
    },
    async listForUser(userId) {
      const memberCount = sql<number>`(select count(*) from ${projectMembers} pm where pm.project_id = ${projects.id})`;
      const openTaskCount = sql<number>`(select count(*) from ${tasks} t where t.project_id = ${projects.id} and t.status != 'done')`;
      return db
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          createdAt: projects.createdAt,
          role: projectMembers.role,
          memberCount: memberCount.mapWith(Number),
          openTaskCount: openTaskCount.mapWith(Number),
        })
        .from(projects)
        .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
        .where(eq(projectMembers.userId, userId))
        .orderBy(asc(projects.name));
    },
    async update(id, patch) {
      if (Object.keys(patch).length === 0) return;
      await db.update(projects).set(patch).where(eq(projects.id, id));
    },
    async delete(id) {
      await db.delete(projects).where(eq(projects.id, id));
    },
    async getRole(projectId, userId) {
      const [row] = await db
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      return row?.role ?? null;
    },
    async listMembers(projectId) {
      return db
        .select({ id: users.id, email: users.email, name: users.name, role: projectMembers.role })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, projectId))
        .orderBy(asc(projectMembers.role), asc(users.name));
    },
    async addMember(projectId, userId, role, maxMembers) {
      const memberCount = sql`(select count(*) from ${projectMembers} where ${projectMembers.projectId} = ${projectId})`;
      return insertMemberWithin(db, projectId, userId, role, memberCount, maxMembers);
    },
    async removeMember(projectId, userId) {
      await db
        .delete(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    },
  };
}
