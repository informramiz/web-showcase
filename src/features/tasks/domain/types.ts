import type { ActivityEntry } from "@/features/activity/domain/types";
export const TASK_STATUSES = ["todo", "in_progress", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
};

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId: string | null;
  /** Calendar date, YYYY-MM-DD. */
  dueDate: string | null;
  /** Sort key inside a status column. */
  position: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A task as it travels over JSON. */
export type TaskJson = Omit<Task, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };

/** The same shape `Response.json` produces, for data handed to the client without going through HTTP. */
export function toTaskJson(task: Task): TaskJson {
  return { ...task, createdAt: task.createdAt.toISOString(), updatedAt: task.updatedAt.toISOString() };
}

export interface TaskFilter {
  search?: string;
  status?: TaskStatus;
  /** A user id, or "unassigned". */
  assigneeId?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type TaskPatch = Partial<Pick<Task, "title" | "description" | "status" | "assigneeId" | "dueDate" | "position">>;

export interface TaskRepository {
  /** Each write stores `activity` in the same atomic batch, so the change and its audit entries succeed or fail together. */
  insert(task: Task, activity: ActivityEntry[]): Promise<void>;
  findById(projectId: string, id: string): Promise<Task | null>;
  list(projectId: string, filter: TaskFilter, offset: number, limit: number): Promise<{ items: Task[]; total: number }>;
  update(
    projectId: string,
    id: string,
    patch: TaskPatch & { updatedAt: Date },
    activity: ActivityEntry[],
  ): Promise<void>;
  delete(projectId: string, id: string, activity: ActivityEntry[]): Promise<void>;
  maxPosition(projectId: string, status: TaskStatus): Promise<number>;
}
