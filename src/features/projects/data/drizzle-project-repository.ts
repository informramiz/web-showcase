import { and, asc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/types";
import { projectMembers, projects, tasks, users } from "@/db/schema";
import type { ProjectRepository } from "../domain/types";

export function createProjectRepository(db: Db): ProjectRepository {
  return {
    async insert(project, ownerId) {
      // D1 has no interactive transactions; batch() is atomic there. Two inserts keep this driver-neutral,
      // and a project without its owner row is invisible to everyone, so a partial write is harmless.
      await db.insert(projects).values(project);
      await db.insert(projectMembers).values({ projectId: project.id, userId: ownerId, role: "owner" });
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
    async addMember(projectId, userId, role) {
      await db.insert(projectMembers).values({ projectId, userId, role });
    },
    async removeMember(projectId, userId) {
      await db
        .delete(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    },
  };
}
