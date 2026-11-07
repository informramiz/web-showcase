import { eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/types";
import { sessions, users } from "@/db/schema";
import type { SessionRepository, UserRepository } from "../domain/types";

export function createUserRepository(db: Db): UserRepository {
  return {
    async findByEmail(email) {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ?? null;
    },
    async findById(id) {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ?? null;
    },
    async findManyByIds(ids) {
      if (ids.length === 0) return [];
      return db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(inArray(users.id, ids));
    },
    async insert(user) {
      await db.insert(users).values(user);
    },
  };
}

export function createSessionRepository(db: Db): SessionRepository {
  return {
    async insert(session) {
      await db.insert(sessions).values(session);
    },
    async findById(id) {
      const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
      return row ?? null;
    },
    async updateExpiry(id, expiresAt) {
      await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    },
    async delete(id) {
      await db.delete(sessions).where(eq(sessions.id, id));
    },
  };
}
