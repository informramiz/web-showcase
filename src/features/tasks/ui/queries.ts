import { queryOptions } from "@tanstack/react-query";
import { tasksApi, type TaskQueryParams } from "./api";

/**
 * The task cache contract, shared by the Client Components and the server prefetch so both use the same keys
 * (Next.js TanStack Query guide). Deliberately not a "use client" module.
 */
export const taskKeys = {
  project: (projectId: string) => ["tasks", projectId] as const,
  list: (projectId: string, q: TaskQueryParams) => ["tasks", projectId, q] as const,
  /** Outside the "tasks" root on purpose: board optimistic updates rewrite every query under that root. */
  detailRoot: (projectId: string) => ["task-detail", projectId] as const,
  detail: (projectId: string, taskId: string) => ["task-detail", projectId, taskId] as const,
};

/** The board shows up to this many tasks in one request; the list view pages through the rest. */
export const BOARD_LIMIT = 100;

/** Board query for a filter. With no filter it is the query the server prefetches. */
export function boardQuery(search = "", assigneeId = ""): TaskQueryParams {
  return { search, assigneeId, pageSize: BOARD_LIMIT };
}

export function taskListOptions(projectId: string, q: TaskQueryParams) {
  return queryOptions({ queryKey: taskKeys.list(projectId, q), queryFn: () => tasksApi.list(projectId, q) });
}

export function taskDetailOptions(projectId: string, taskId: string) {
  return queryOptions({
    queryKey: taskKeys.detail(projectId, taskId),
    queryFn: () => tasksApi.detail(projectId, taskId),
  });
}
