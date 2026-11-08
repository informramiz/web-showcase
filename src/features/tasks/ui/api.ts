import type { Jsonified } from "@/core/json";
import type { ActivityView } from "@/features/activity/domain/types";
import type { CommentView } from "@/features/comments/domain/types";
import type { Page, TaskJson, TaskStatus } from "../domain/types";

export interface TaskQueryParams {
  search?: string;
  status?: TaskStatus;
  assigneeId?: string;
  page?: number;
  pageSize?: number;
}

export interface NewTask {
  title: string;
  status?: TaskStatus;
  assigneeId?: string | null;
  dueDate?: string | null;
}

export type TaskUpdate = Partial<
  Pick<TaskJson, "title" | "description" | "status" | "assigneeId" | "dueDate" | "position">
>;

export type CommentJson = Jsonified<CommentView>;
export type ActivityJson = Jsonified<ActivityView>;

export interface TaskDetailJson {
  task: TaskJson;
  comments: CommentJson[];
  activity: ActivityJson[];
}

/** Error thrown for non-2xx responses; carries the server's message and field errors. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: { method: string; body?: string }): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: { message?: string; fields?: Record<string, string[]> } } | null)?.error;
    throw new ApiError(res.status, err?.message ?? `Request failed (${res.status})`, err?.fields);
  }
  return body as T;
}

const base = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/tasks`;
const item = (projectId: string, id: string) => `${base(projectId)}/${encodeURIComponent(id)}`;

export const tasksApi = {
  list(projectId: string, q: TaskQueryParams): Promise<Page<TaskJson>> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== "") params.set(k, String(v));
    return request(`${base(projectId)}?${params.toString()}`);
  },
  create: (projectId: string, input: NewTask) =>
    request<TaskJson>(base(projectId), { method: "POST", body: JSON.stringify(input) }),
  update: (projectId: string, id: string, patch: TaskUpdate) =>
    request<TaskJson>(item(projectId, id), { method: "PATCH", body: JSON.stringify(patch) }),
  remove: (projectId: string, id: string) => request<undefined>(item(projectId, id), { method: "DELETE" }),
  detail: (projectId: string, id: string) => request<TaskDetailJson>(item(projectId, id)),
  addComment: (projectId: string, id: string, body: string) =>
    request<CommentJson>(`${item(projectId, id)}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
};
