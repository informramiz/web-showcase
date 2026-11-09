import { AppError } from "@/core/errors";
import { parseInput } from "@/core/validation";
import type { ActivityLog } from "@/features/activity/domain/types";
import type { User } from "@/features/auth/domain/types";
import type { ProjectService } from "@/features/projects/domain/project-service";
import type { TaskRepository } from "@/features/tasks/domain/types";
import { createCommentSchema } from "./schemas";
import type { CommentRepository, CommentView } from "./types";

export interface CommentDeps {
  comments: CommentRepository;
  tasks: Pick<TaskRepository, "findById">;
  projectService: Pick<ProjectService, "authorize">;
  activity: ActivityLog;
  now?: () => Date;
  newId?: () => string;
}

export class CommentService {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly deps: CommentDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  async list(actor: User, projectId: string, taskId: string): Promise<CommentView[]> {
    await this.deps.projectService.authorize(actor, projectId, "project.view");
    return this.deps.comments.listForTask(projectId, taskId);
  }

  async add(actor: User, projectId: string, taskId: string, input: unknown): Promise<CommentView> {
    await this.deps.projectService.authorize(actor, projectId, "comment.create");
    const { body } = parseInput(createCommentSchema, input);
    const task = await this.deps.tasks.findById(projectId, taskId);
    if (!task) throw new AppError("not_found", "Task not found");
    const comment = { id: this.newId(), projectId, taskId, authorId: actor.id, body, createdAt: this.now() };
    const entry = this.deps.activity.prepare({ projectId, taskId, actorId: actor.id, action: "comment.added" });
    await this.deps.comments.insert(comment, [entry]);
    await this.deps.activity.publish([entry]);
    return { ...comment, authorName: actor.name };
  }
}
