import { openSqlite } from "@/db/sqlite";
import type { PasswordHasher, User } from "@/features/auth/domain/types";
import { createContainer, type Container, type ContainerOptions } from "@/server/container";

/** Fast, deterministic hasher for tests that are not about hashing. */
export const plainHasher: PasswordHasher = {
  hash: (p) => Promise.resolve(`plain$${p}`),
  verify: (p, stored) => Promise.resolve(stored === `plain$${p}`),
};

export interface World {
  c: Container;
  owner: User;
  member: User;
  outsider: User;
  projectId: string;
}

/** A fresh in-memory database with three users and one project (owner + member). */
export async function makeWorld(options: ContainerOptions = {}): Promise<World> {
  const c = createContainer(openSqlite(":memory:"), { hasher: plainHasher, ...options });
  const reg = async (name: string) =>
    (await c.auth.register({ name, email: `${name.toLowerCase()}@test.dev`, password: "password1" })).user;
  const owner = await reg("Olivia");
  const member = await reg("Max");
  const outsider = await reg("Otto");
  const project = await c.projects.create(owner, { name: "Alpha" });
  await c.projects.addMember(owner, project.id, { email: member.email });
  return { c, owner, member, outsider, projectId: project.id };
}
