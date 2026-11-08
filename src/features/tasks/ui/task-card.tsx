"use client";

import { Avatar } from "@/components/avatar";
import { dueLabel } from "../domain/due-date";
import { STATUS_LABEL, TASK_STATUSES, type TaskJson, type TaskStatus } from "../domain/types";

export interface MemberRef {
  id: string;
  name: string;
}

interface Props {
  task: TaskJson;
  assignee?: MemberRef;
  canDelete: boolean;
  onMove: (status: TaskStatus) => void;
  onDelete: () => void;
  onOpen: () => void;
}

export function TaskCard({ task, assignee, canDelete, onMove, onDelete, onOpen }: Props) {
  const due = dueLabel(task.dueDate, task.status);
  const pending = task.id.startsWith("temp-");
  return (
    <article
      data-testid="task-card"
      draggable={!pending}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      className={`card group cursor-grab space-y-2 p-3 shadow-sm active:cursor-grabbing ${pending ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        onClick={onOpen}
        disabled={pending}
        className={`block w-full text-left text-sm font-medium hover:underline ${task.status === "done" ? "text-muted line-through" : ""}`}
      >
        {task.title}
      </button>
      <div className="flex items-center gap-2 text-xs text-muted">
        {due && (
          <span className={`rounded px-1.5 py-0.5 ${due.overdue ? "bg-danger/10 text-danger" : "bg-surface-2"}`}>
            {due.overdue ? "Overdue · " : ""}
            {due.text}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <select
            aria-label={`Move "${task.title}"`}
            value={task.status}
            disabled={pending}
            onChange={(e) => onMove(e.target.value as TaskStatus)}
            className="rounded border border-border bg-surface px-1 py-0.5 text-xs"
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {canDelete && !pending && (
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete "${task.title}"`}
              className="rounded px-1 text-muted hover:text-danger"
            >
              ✕
            </button>
          )}
          {assignee && <Avatar name={assignee.name} size="sm" />}
        </span>
      </div>
    </article>
  );
}
