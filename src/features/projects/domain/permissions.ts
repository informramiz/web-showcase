import type { Role } from "./types";

/**
 * The single place that decides who may do what inside a project.
 * Every service method checks one of these before touching data.
 */
export type ProjectAction =
  | "project.view"
  | "project.update"
  | "project.delete"
  | "members.manage"
  | "task.create"
  | "task.update"
  | "task.delete"
  | "comment.create"
  | "attachment.create"
  | "attachment.delete.any";

const MEMBER_ACTIONS: ReadonlySet<ProjectAction> = new Set([
  "project.view",
  "task.create",
  "task.update",
  "comment.create",
  "attachment.create",
]);

export function can(role: Role | null, action: ProjectAction): boolean {
  if (role === "owner") return true;
  if (role === "member") return MEMBER_ACTIONS.has(action);
  return false;
}
