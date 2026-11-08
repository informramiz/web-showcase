import { AppError } from "@/core/errors";
import { parseInput } from "@/core/validation";
import { noopActivityLog, type ActivityLog } from "@/features/activity/domain/types";
import type { User } from "@/features/auth/domain/types";
import type { ProjectRepository } from "@/features/projects/domain/types";
import type { ProjectService } from "@/features/projects/domain/project-service";
import { createTaskSchema, taskQuerySchema, updateTaskSchema } from "./schemas";
import type { Page, Task, TaskPatch, TaskRepository } from "./types";

export interface TaskDeps {
  tasks: TaskRepository;
  /** Only membership lookups are needed, to check that an assignee belongs to the project. */
  projects: Pick<ProjectRepository, "getRole">;
  /** Owns the role check, so tasks follow the same rules as everything else in a project. */
  projectService: Pick<ProjectService, "authorize">;
  /** Audit trail; also what drives realtime notifications. */
  activity?: ActivityLog;
  now?: () => Date;
  newId?: () => string;
}

export class TaskService {
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly activity: ActivityLog;

  constructor(private readonly deps: TaskDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.activity = deps.activity ?? noopActivityLog;
  }

  async get(actor: User, projectId: string, taskId: string): Promise<Task> {
    await this.deps.projectService.authorize(actor, projectId, "project.view");
    const task = await this.deps.tasks.findById(projectId, taskId);
    if (!task) throw new AppError("not_found", "Task not found");
    return task;
  }

  async list(actor: User, projectId: string, query: unknown): Promise<Page<Task>> {
    await this.deps.projectService.authorize(actor, projectId, "project.view");
    const { page, pageSize, ...filter } = parseInput(taskQuerySchema, query);
    const { items, total } = await this.deps.tasks.list(projectId, filter, (page - 1) * pageSize, pageSize);
    return { items, total, page, pageSize };
  }

  async create(actor: User, projectId: string, input: unknown): Promise<Task> {
    await this.deps.projectService.authorize(actor, projectId, "task.create");
    const data = parseInput(createTaskSchema, input);
    await this.assertAssignable(projectId, data.assigneeId);
    const now = this.now();
    const task: Task = {
      id: this.newId(),
      projectId,
      ...data,
      position: (await this.deps.tasks.maxPosition(projectId, data.status)) + 1,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    };
    await this.deps.tasks.insert(task);
    await this.activity.record({
      projectId,
      taskId: task.id,
      actorId: actor.id,
      action: "task.created",
      detail: { name: task.title },
    });
    return task;
  }

  async update(actor: User, projectId: string, taskId: string, input: unknown): Promise<Task> {
    await this.deps.projectService.authorize(actor, projectId, "task.update");
    const patch = parseInput(updateTaskSchema, input);
    const existing = await this.deps.tasks.findById(projectId, taskId);
    if (!existing) throw new AppError("not_found", "Task not found");
    if (patch.assigneeId !== undefined) await this.assertAssignable(projectId, patch.assigneeId);
    // Moving to another column without a position puts the card at the bottom of that column.
    if (patch.status && patch.status !== existing.status && patch.position === undefined) {
      patch.position = (await this.deps.tasks.maxPosition(projectId, patch.status)) + 1;
    }
    const updatedAt = this.now();
    await this.deps.tasks.update(projectId, taskId, { ...patch, updatedAt });
    const updated = { ...existing, ...patch, updatedAt };
    await this.recordUpdate(actor, existing, updated, patch);
    return updated;
  }

  async delete(actor: User, projectId: string, taskId: string): Promise<void> {
    await this.deps.projectService.authorize(actor, projectId, "task.delete");
    const existing = await this.deps.tasks.findById(projectId, taskId);
    if (!existing) throw new AppError("not_found", "Task not found");
    await this.deps.tasks.delete(projectId, taskId);
    await this.activity.record({
      projectId,
      taskId,
      actorId: actor.id,
      action: "task.deleted",
      detail: { name: existing.title },
    });
  }

  /** A column change is logged as a move; any other changed field as an edit. A no-op patch logs nothing. */
  private async recordUpdate(actor: User, before: Task, after: Task, patch: TaskPatch): Promise<void> {
    const base = { projectId: before.projectId, taskId: before.id, actorId: actor.id };
    if (after.status !== before.status) {
      await this.activity.record({
        ...base,
        action: "task.moved",
        detail: { from: before.status, to: after.status, name: after.title },
      });
    }
    const fields = (Object.keys(patch) as (keyof TaskPatch)[]).filter(
      (k) => k !== "status" && !(k === "position" && after.status !== before.status) && before[k] !== after[k],
    );
    if (fields.length > 0) {
      await this.activity.record({ ...base, action: "task.updated", detail: { fields, name: after.title } });
    }
  }

  private async assertAssignable(projectId: string, assigneeId: string | null): Promise<void> {
    if (assigneeId === null) return;
    if (!(await this.deps.projects.getRole(projectId, assigneeId))) {
      throw new AppError("validation", "Assignee must be a project member", {
        assigneeId: ["Assignee must be a project member"],
      });
    }
  }
}
