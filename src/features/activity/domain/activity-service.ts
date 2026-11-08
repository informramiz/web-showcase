import type { User } from "@/features/auth/domain/types";
import type { ProjectService } from "@/features/projects/domain/project-service";
import type { ProjectEvents } from "@/features/realtime/domain/types";
import type { ActivityInput, ActivityLog, ActivityRepository, ActivityView } from "./types";

export interface ActivityDeps {
  activity: ActivityRepository;
  projectService: Pick<ProjectService, "authorize">;
  events: ProjectEvents;
  now?: () => Date;
  newId?: () => string;
}

/** Newest entries shown on a task. Older history stays in the table. */
export const ACTIVITY_LIMIT = 50;

/**
 * Writes the audit trail and, because every change to a project's board passes through here, doubles as the
 * source of realtime notifications. Publishing is best effort: a dropped notification only delays other viewers
 * until their next refetch, so it must never fail the request that made the change.
 */
export class ActivityService implements ActivityLog {
  private readonly now: () => Date;
  private readonly newId: () => string;

  constructor(private readonly deps: ActivityDeps) {
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? (() => crypto.randomUUID());
  }

  async record(input: ActivityInput): Promise<void> {
    const createdAt = this.now();
    await this.deps.activity.insert({ id: this.newId(), ...input, detail: input.detail ?? null, createdAt });
    try {
      await this.deps.events.publish(input.projectId, {
        action: input.action,
        taskId: input.taskId,
        actorId: input.actorId,
        at: createdAt.toISOString(),
      });
    } catch (e) {
      console.error("realtime publish failed", e);
    }
  }

  async listForTask(actor: User, projectId: string, taskId: string): Promise<ActivityView[]> {
    await this.deps.projectService.authorize(actor, projectId, "project.view");
    return this.deps.activity.listForTask(projectId, taskId, ACTIVITY_LIMIT);
  }
}
