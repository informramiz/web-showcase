import { beforeEach, describe, expect, it } from "vitest";
import { makeWorld, type World } from "../helpers/setup";

let w: World;
beforeEach(async () => {
  w = await makeWorld();
});

const create = (title: string, extra: Record<string, unknown> = {}) =>
  w.c.tasks.create(w.member, w.projectId, { title, ...extra });

describe("TaskService + SQLite", () => {
  it("creates tasks at the end of their column", async () => {
    const a = await create("A");
    const b = await create("B");
    const c = await create("C", { status: "done" });
    expect([a.position, b.position, c.position]).toEqual([1, 2, 1]);
    expect(a.createdBy).toBe(w.member.id);
  });

  it("only assigns tasks to project members", async () => {
    await expect(create("x", { assigneeId: w.outsider.id })).rejects.toMatchObject({
      kind: "validation",
      fields: { assigneeId: ["Assignee must be a project member"] },
    });
    const t = await create("x", { assigneeId: w.owner.id });
    expect(t.assigneeId).toBe(w.owner.id);
  });

  it("filters by status, assignee and search, and paginates", async () => {
    for (let i = 1; i <= 7; i++) await create(`Task ${i}`, { assigneeId: i % 2 ? w.owner.id : null });
    await create("Fix login bug", { status: "in_progress", description: "500 on submit" });
    await create("Discount 50% banner", { status: "done" });

    const page1 = await w.c.tasks.list(w.member, w.projectId, { pageSize: "3" });
    expect(page1).toMatchObject({ total: 9, page: 1, pageSize: 3 });
    expect(page1.items.map((t) => t.title)).toEqual(["Task 1", "Task 2", "Task 3"]);
    const page3 = await w.c.tasks.list(w.member, w.projectId, { pageSize: "3", page: "3" });
    // Ordered by column: todo, in progress, done.
    expect(page3.items.map((t) => t.title)).toEqual(["Task 7", "Fix login bug", "Discount 50% banner"]);

    expect((await w.c.tasks.list(w.member, w.projectId, { status: "done" })).total).toBe(1);
    expect((await w.c.tasks.list(w.member, w.projectId, { assigneeId: w.owner.id })).total).toBe(4);
    expect((await w.c.tasks.list(w.member, w.projectId, { assigneeId: "unassigned" })).total).toBe(5);
    expect((await w.c.tasks.list(w.member, w.projectId, { search: "LOGIN" })).items[0]?.title).toBe("Fix login bug");
    expect((await w.c.tasks.list(w.member, w.projectId, { search: "submit" })).total).toBe(1);
    // % is matched literally, not as a wildcard.
    expect((await w.c.tasks.list(w.member, w.projectId, { search: "50%" })).total).toBe(1);
    expect((await w.c.tasks.list(w.member, w.projectId, { search: "5%0" })).total).toBe(0);
  });

  it("moves a task to the bottom of another column", async () => {
    await create("done already", { status: "done" });
    const t = await create("move me");
    const moved = await w.c.tasks.update(w.member, w.projectId, t.id, { status: "done" });
    expect(moved).toMatchObject({ status: "done", position: 2 });
    const done = await w.c.tasks.list(w.member, w.projectId, { status: "done" });
    expect(done.items.map((x) => x.title)).toEqual(["done already", "move me"]);
  });

  it("keeps an explicit position and edits fields", async () => {
    const t = await create("x");
    const u = await w.c.tasks.update(w.member, w.projectId, t.id, {
      status: "in_progress",
      position: 0.5,
      title: "renamed",
      dueDate: "2026-12-01",
      assigneeId: w.member.id,
    });
    expect(u).toMatchObject({ position: 0.5, title: "renamed", dueDate: "2026-12-01", assigneeId: w.member.id });
    await expect(w.c.tasks.update(w.member, w.projectId, t.id, { assigneeId: w.outsider.id })).rejects.toMatchObject({
      kind: "validation",
    });
    await expect(w.c.tasks.update(w.member, w.projectId, "missing", { title: "y" })).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("lets only the owner delete tasks", async () => {
    const t = await create("x");
    await expect(w.c.tasks.delete(w.member, w.projectId, t.id)).rejects.toMatchObject({ kind: "forbidden" });
    await w.c.tasks.delete(w.owner, w.projectId, t.id);
    await expect(w.c.tasks.delete(w.owner, w.projectId, t.id)).rejects.toMatchObject({ kind: "not_found" });
  });

  it("keeps outsiders out of every operation", async () => {
    const t = await create("x");
    const o = w.outsider;
    await expect(w.c.tasks.list(o, w.projectId, {})).rejects.toMatchObject({ kind: "not_found" });
    await expect(w.c.tasks.create(o, w.projectId, { title: "y" })).rejects.toMatchObject({ kind: "not_found" });
    await expect(w.c.tasks.update(o, w.projectId, t.id, { title: "y" })).rejects.toMatchObject({ kind: "not_found" });
  });

  it("does not leak tasks across projects", async () => {
    const t = await create("x");
    const other = await w.c.projects.create(w.member, { name: "Other" });
    await expect(w.c.tasks.update(w.member, other.id, t.id, { title: "y" })).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});
