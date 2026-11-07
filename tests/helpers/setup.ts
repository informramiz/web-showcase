import { openSqlite } from "@/db/sqlite";
import type { User } from "@/features/auth/domain/types";
import type { PasswordHasher } from "@/features/auth/domain/types";
import { createContainer, type Container } from "@/server/container";

/** Fast, deterministic hasher for tests that are not about hashing. */
export const plainHasher: PasswordHasher = {
  hash: async (p) => `plain$${p}`,
  verify: async (p, stored) => stored === `plain$${p}`,
};

export interface World {
  c: Container;
  owner: User;
  member: User;
  outsider: User;
  projectId: string;
}

/** A fresh in-memory database with three users and one project (owner + member). */
export async function makeWorld(): Promise<World> {
  const c = createContainer(openSqlite(":memory:"), plainHasher);
  const reg = async (name: string) =>
    (await c.auth.register({ name, email: `${name.toLowerCase()}@test.dev`, password: "password1" })).user;
  const owner = await reg("Olivia");
  const member = await reg("Max");
  const outsider = await reg("Otto");
  const project = await c.projects.create(owner, { name: "Alpha" });
  await c.projects.addMember(owner, project.id, { email: member.email });
  return { c, owner, member, outsider, projectId: project.id };
}
