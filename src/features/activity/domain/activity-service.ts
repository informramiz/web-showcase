import type { User } from "@/features/auth/domain/types";
import type { ProjectService } from "@/features/projects/domain/project-service";
import type { ProjectEvents } from "@/features/realtime/domain/types";
import type { ActivityEntry, ActivityInput, ActivityLog, ActivityRepository, ActivityView } from "./types";

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
 * Builds the audit trail and, because every change to a project's board passes through here, doubles as the
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

  prepare(input: ActivityInput): ActivityEntry {
    return { id: this.newId(), ...input, detail: input.detail ?? null, createdAt: this.now() };
  }

  async publish(entries: ActivityEntry[]): Promise<void> {
    for (const e of entries) {
      try {
        await this.deps.events.publish(e.projectId, {
          action: e.action,
          taskId: e.taskId,
          actorId: e.actorId,
          at: e.createdAt.toISOString(),
        });
      } catch (err) {
        console.error("realtime publish failed", err);
      }
    }
  }

  async listForTask(actor: User, projectId: string, taskId: string): Promise<ActivityView[]> {
    await this.deps.projectService.authorize(actor, projectId, "project.view");
    return this.deps.activity.listForTask(projectId, taskId, ACTIVITY_LIMIT);
  }
}
