import { beforeEach, describe, expect, it, vi } from "vitest";
import { openSqlite } from "@/db/sqlite";
import type { ProjectEvent } from "@/features/realtime/domain/types";
import { createContainer } from "@/server/container";
import { makeWorld, plainHasher, type World } from "../helpers/setup";

let w: World;
beforeEach(async () => {
  w = await makeWorld();
});

const actions = async (taskId: string) =>
  (await w.c.activity.listForTask(w.member, w.projectId, taskId)).map((a) => a.action).reverse();

describe("comments", () => {
  it("lets members comment and lists comments oldest first with author names", async () => {
    const t = await w.c.tasks.create(w.owner, w.projectId, { title: "Spec" });
    await w.c.comments.add(w.member, w.projectId, t.id, { body: "  First  " });
    await w.c.comments.add(w.owner, w.projectId, t.id, { body: "Second" });
    const list = await w.c.comments.list(w.member, w.projectId, t.id);
    expect(list.map((c) => [c.authorName, c.body])).toEqual([
      ["Max", "First"],
      ["Olivia", "Second"],
    ]);
  });

  it("validates the body, the task and membership", async () => {
    const t = await w.c.tasks.create(w.owner, w.projectId, { title: "Spec" });
    await expect(w.c.comments.add(w.member, w.projectId, t.id, { body: " " })).rejects.toMatchObject({
      kind: "validation",
    });
    await expect(w.c.comments.add(w.member, w.projectId, "nope", { body: "hi" })).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(w.c.comments.add(w.outsider, w.projectId, t.id, { body: "hi" })).rejects.toMatchObject({
      kind: "not_found",
    });
    await expect(w.c.comments.list(w.outsider, w.projectId, t.id)).rejects.toMatchObject({ kind: "not_found" });
  });
});

describe("activity log", () => {
  it("records who created, edited, moved, commented on and deleted a task", async () => {
    const t = await w.c.tasks.create(w.owner, w.projectId, { title: "Spec" });
    await w.c.tasks.update(w.member, w.projectId, t.id, { title: "Spec v2", assigneeId: w.member.id });
    await w.c.tasks.update(w.member, w.projectId, t.id, { status: "done" });
    await w.c.tasks.update(w.member, w.projectId, t.id, { title: "Spec v2" }); // no-op, not logged
    await w.c.comments.add(w.member, w.projectId, t.id, { body: "Done" });
    await w.c.tasks.delete(w.owner, w.projectId, t.id);

    const log = await w.c.activity.listForTask(w.owner, w.projectId, t.id);
    expect(log.map((a) => a.action).reverse()).toEqual([
      "task.created",
      "task.updated",
      "task.moved",
      "comment.added",
      "task.deleted",
    ]);
    const byAction = Object.fromEntries(log.map((a) => [a.action, a]));
    expect(byAction["task.updated"]).toMatchObject({ actorName: "Max", detail: { fields: ["title", "assigneeId"] } });
    expect(byAction["task.moved"]?.detail).toMatchObject({ from: "todo", to: "done", name: "Spec v2" });
    // History outlives the task.
    expect(byAction["task.deleted"]).toMatchObject({ actorName: "Olivia", detail: { name: "Spec v2" } });
  });

  it("logs a move and an edit in one patch as two entries, and a reorder as an edit", async () => {
    const t = await w.c.tasks.create(w.owner, w.projectId, { title: "A" });
    await w.c.tasks.update(w.member, w.projectId, t.id, { status: "in_progress", position: 5, title: "B" });
    await w.c.tasks.update(w.member, w.projectId, t.id, { position: 9 });
    expect(await actions(t.id)).toEqual(["task.created", "task.moved", "task.updated", "task.updated"]);
  });

  it("hides the log from outsiders", async () => {
    const t = await w.c.tasks.create(w.owner, w.projectId, { title: "A" });
    await expect(w.c.activity.listForTask(w.outsider, w.projectId, t.id)).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("publishes an event per entry and never fails the write when publishing fails", async () => {
    const published: [string, ProjectEvent][] = [];
    const c = createContainer(openSqlite(":memory:"), {
      hasher: plainHasher,
      events: {
        publish: (projectId, e) => {
          published.push([projectId, e]);
          return e.action === "task.updated" ? Promise.reject(new Error("socket down")) : Promise.resolve();
        },
      },
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { user } = await c.auth.register({ name: "A", email: "a@test.dev", password: "password1" });
    const p = await c.projects.create(user, { name: "P" });
    const t = await c.tasks.create(user, p.id, { title: "T" });
    await expect(c.tasks.update(user, p.id, t.id, { title: "T2" })).resolves.toMatchObject({ title: "T2" });

    expect(published.map(([pid, e]) => [pid, e.action, e.taskId, e.actorId])).toEqual([
      [p.id, "task.created", t.id, user.id],
      [p.id, "task.updated", t.id, user.id],
    ]);
    expect(errors).toHaveBeenCalledOnce();
    errors.mockRestore();
  });
});
