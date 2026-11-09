import { describe, expect, it, vi } from "vitest";
import { atomically, type Statement } from "@/db/atomic";
import { openSqlite } from "@/db/sqlite";
import type { Db } from "@/db/types";
import type { ActivityEntry } from "@/features/activity/domain/types";
import { createCommentRepository } from "@/features/comments/data/drizzle-comment-repository";
import { createTaskRepository } from "@/features/tasks/data/drizzle-task-repository";
import { createContainer } from "@/server/container";
import { plainHasher } from "../helpers/setup";

const entry = (projectId: string, taskId: string, actorId: string): ActivityEntry => ({
  id: crypto.randomUUID(),
  projectId,
  taskId,
  actorId,
  action: "task.created",
  detail: null,
  createdAt: new Date(),
});

async function setup() {
  const db = openSqlite(":memory:");
  const c = createContainer(db, { hasher: plainHasher });
  const { user } = await c.auth.register({ name: "Olivia", email: "o@test.dev", password: "password1" });
  const project = await c.projects.create(user, { name: "Alpha" });
  const task = await c.tasks.create(user, project.id, { title: "Spec" });
  return { db, c, user, projectId: project.id, task };
}

describe("a change and its audit row are one atomic write", () => {
  it("does not create a task when its audit row is rejected (unknown actor violates the FK)", async () => {
    const { db, user, projectId, task } = await setup();
    const tasks = createTaskRepository(db);
    const orphan = { ...task, id: "t2", title: "Orphan" };
    await expect(tasks.insert(orphan, [entry(projectId, "t2", "ghost")])).rejects.toThrow();
    expect(await tasks.findById(projectId, "t2")).toBeNull();
    expect(user.id).toBeTruthy();
  });

  it("does not apply an update when its audit row is rejected", async () => {
    const { db, projectId, task } = await setup();
    const tasks = createTaskRepository(db);
    await expect(
      tasks.update(projectId, task.id, { title: "Changed", updatedAt: new Date() }, [
        entry(projectId, task.id, "ghost"),
      ]),
    ).rejects.toThrow();
    expect((await tasks.findById(projectId, task.id))?.title).toBe("Spec");
  });

  it("does not delete a task when its audit row is rejected", async () => {
    const { db, projectId, task } = await setup();
    const tasks = createTaskRepository(db);
    await expect(tasks.delete(projectId, task.id, [entry(projectId, task.id, "ghost")])).rejects.toThrow();
    expect(await tasks.findById(projectId, task.id)).not.toBeNull();
  });

  it("does not add a comment when its audit row is rejected", async () => {
    const { db, user, projectId, task } = await setup();
    const comments = createCommentRepository(db);
    const comment = { id: "c1", projectId, taskId: task.id, authorId: user.id, body: "hi", createdAt: new Date() };
    await expect(comments.insert(comment, [entry(projectId, task.id, "ghost")])).rejects.toThrow();
    expect(await comments.listForTask(projectId, task.id)).toEqual([]);
  });

  it("stores the task and its audit row together when both are valid", async () => {
    const { c, user, projectId, task } = await setup();
    const log = await c.activity.listForTask(user, projectId, task.id);
    expect(log.map((a) => a.action)).toEqual(["task.created"]);
  });
});

describe("atomically()", () => {
  it("sends every statement to D1 as one db.batch call", async () => {
    const batch = vi.fn().mockResolvedValue([]);
    const stmts = ["a", "b"] as unknown as [Statement, ...Statement[]];
    await atomically({ batch } as unknown as Db, stmts);
    expect(batch).toHaveBeenCalledExactlyOnceWith(stmts);
  });
});
