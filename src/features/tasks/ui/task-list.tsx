"use client";

import { Avatar } from "@/components/avatar";
import { STATUS_LABEL, TASK_STATUSES, type Page, type TaskJson, type TaskStatus } from "../domain/types";
import { dueLabel, type MemberRef } from "./task-card";

interface Props {
  page: Page<TaskJson>;
  members: Map<string, MemberRef>;
  onMove: (task: TaskJson, status: TaskStatus) => void;
  onPage: (page: number) => void;
}

export function TaskList({ page, members, onMove, onPage }: Props) {
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Task</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="hidden px-3 py-2 font-medium sm:table-cell">Assignee</th>
              <th className="px-3 py-2 font-medium">Due</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((t) => {
              const a = t.assigneeId ? members.get(t.assigneeId) : undefined;
              const due = dueLabel(t.dueDate, t.status);
              return (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2">{t.title}</td>
                  <td className="px-3 py-2">
                    <select
                      aria-label={`Status of "${t.title}"`}
                      value={t.status}
                      onChange={(e) => onMove(t, e.target.value as TaskStatus)}
                      className="rounded border border-border bg-surface px-1 py-0.5 text-xs"
                    >
                      {TASK_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="hidden px-3 py-2 sm:table-cell">
                    {a ? (
                      <span className="flex items-center gap-2">
                        <Avatar name={a.name} size="sm" /> {a.name}
                      </span>
                    ) : (
                      <span className="text-muted">Unassigned</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${due?.overdue ? "text-danger" : "text-muted"}`}>
                    {due?.text ?? "—"}
                  </td>
                </tr>
              );
            })}
            {page.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted">
                  No tasks match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted">
        <span>
          {page.total} {page.total === 1 ? "task" : "tasks"} · page {page.page} of {pages}
        </span>
        <span className="flex gap-2">
          <button className="btn-ghost py-1" disabled={page.page <= 1} onClick={() => onPage(page.page - 1)}>
            Previous
          </button>
          <button className="btn-ghost py-1" disabled={page.page >= pages} onClick={() => onPage(page.page + 1)}>
            Next
          </button>
        </span>
      </div>
    </div>
  );
}
