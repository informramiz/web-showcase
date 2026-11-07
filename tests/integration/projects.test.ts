import { beforeEach, describe, expect, it } from "vitest";
import { makeWorld, type World } from "../helpers/setup";

let w: World;
beforeEach(async () => {
  w = await makeWorld();
});

describe("ProjectService + SQLite", () => {
  it("lists projects with role and counts", async () => {
    await w.c.tasks.create(w.owner, w.projectId, { title: "open" });
    await w.c.tasks.create(w.owner, w.projectId, { title: "closed", status: "done" });
    const [p] = await w.c.projects.listForUser(w.member);
    expect(p).toMatchObject({ name: "Alpha", role: "member", memberCount: 2, openTaskCount: 1 });
    expect(await w.c.projects.listForUser(w.outsider)).toEqual([]);
  });

  it("returns detail with members, owner first", async () => {
    const d = await w.c.projects.get(w.member, w.projectId);
    expect(d.role).toBe("member");
    expect(d.members.map((m) => [m.name, m.role])).toEqual([
      ["Max", "member"],
      ["Olivia", "owner"],
    ]);
  });

  it("hides projects from non-members as not found", async () => {
    await expect(w.c.projects.get(w.outsider, w.projectId)).rejects.toMatchObject({ kind: "not_found" });
  });

  it("only lets the owner rename, manage members and delete", async () => {
    await expect(w.c.projects.update(w.member, w.projectId, { name: "X" })).rejects.toMatchObject({
      kind: "forbidden",
    });
    await w.c.projects.update(w.owner, w.projectId, { name: "Beta" });
    await w.c.projects.update(w.owner, w.projectId, {});
    expect((await w.c.projects.get(w.owner, w.projectId)).name).toBe("Beta");

    await expect(w.c.projects.addMember(w.member, w.projectId, { email: w.outsider.email })).rejects.toMatchObject({
      kind: "forbidden",
    });
    await expect(w.c.projects.delete(w.member, w.projectId)).rejects.toMatchObject({ kind: "forbidden" });
  });

  it("adds and removes members with checks", async () => {
    await expect(w.c.projects.addMember(w.owner, w.projectId, { email: "nobody@test.dev" })).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(w.c.projects.addMember(w.owner, w.projectId, { email: w.member.email })).rejects.toMatchObject({
      kind: "conflict",
    });
    const added = await w.c.projects.addMember(w.owner, w.projectId, { email: w.outsider.email });
    expect(added).toMatchObject({ id: w.outsider.id, role: "member" });

    await expect(w.c.projects.removeMember(w.owner, w.projectId, w.owner.id)).rejects.toMatchObject({
      kind: "validation",
    });
    await expect(w.c.projects.removeMember(w.owner, w.projectId, "ghost")).rejects.toMatchObject({
      kind: "not_found",
    });
    await w.c.projects.removeMember(w.owner, w.projectId, w.outsider.id);
    await expect(w.c.projects.get(w.outsider, w.projectId)).rejects.toMatchObject({ kind: "not_found" });
  });

  it("deletes a project and its tasks", async () => {
    await w.c.tasks.create(w.owner, w.projectId, { title: "t" });
    await w.c.projects.delete(w.owner, w.projectId);
    expect(await w.c.projects.listForUser(w.owner)).toEqual([]);
  });

  it("validates project input", async () => {
    await expect(w.c.projects.create(w.owner, { name: "  " })).rejects.toMatchObject({ kind: "validation" });
  });
});
