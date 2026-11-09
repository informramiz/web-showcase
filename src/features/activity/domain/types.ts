import type { TaskStatus } from "@/features/tasks/domain/types";

export const ACTIVITY_ACTIONS = [
  "task.created",
  "task.updated",
  "task.moved",
  "task.deleted",
  "comment.added",
  "attachment.added",
  "attachment.deleted",
] as const;
export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface ActivityDetail {
  /** Task fields an update touched. */
  fields?: string[];
  from?: TaskStatus;
  to?: TaskStatus;
  /** Task title or file name, so the entry still reads well after the task or file is gone. */
  name?: string;
}

export interface ActivityEntry {
  id: string;
  projectId: string;
  taskId: string | null;
  actorId: string;
  action: ActivityAction;
  detail: ActivityDetail | null;
  createdAt: Date;
}

export interface ActivityView extends ActivityEntry {
  actorName: string;
}

export interface ActivityRepository {
  listForTask(projectId: string, taskId: string, limit: number): Promise<ActivityView[]>;
}

export type ActivityInput = Pick<ActivityEntry, "projectId" | "taskId" | "actorId" | "action"> & {
  detail?: ActivityDetail;
};

/**
 * What other services depend on to leave an audit trail. Two steps, so the entry can be stored in the same
 * atomic write as the change it describes: `prepare` builds it, the caller's repository writes it together with
 * the change, and `publish` then tells live viewers.
 */
export interface ActivityLog {
  prepare(input: ActivityInput): ActivityEntry;
  publish(entries: ActivityEntry[]): Promise<void>;
}
