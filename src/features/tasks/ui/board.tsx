"use client";

import { useState } from "react";
import { STATUS_LABEL, TASK_STATUSES, type TaskJson, type TaskStatus } from "../domain/types";
import { TaskCard, type MemberRef } from "./task-card";

interface Props {
  tasks: TaskJson[];
  members: Map<string, MemberRef>;
  canDelete: boolean;
  onMove: (task: TaskJson, status: TaskStatus) => void;
  onDelete: (task: TaskJson) => void;
  onOpen: (task: TaskJson) => void;
}

const ACCENT: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-amber-500",
  done: "bg-emerald-500",
};

export function Board({ tasks, members, canDelete, onMove, onDelete, onOpen }: Props) {
  const [over, setOver] = useState<TaskStatus | null>(null);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {TASK_STATUSES.map((status) => {
        const column = tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position);
        return (
          <section
            key={status}
            data-testid={`column-${status}`}
            aria-label={STATUS_LABEL[status]}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(status);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const task = byId.get(e.dataTransfer.getData("text/task-id"));
              if (task && task.status !== status) onMove(task, status);
            }}
            className={`flex min-h-40 flex-col gap-2 rounded-lg bg-surface-2 p-3 transition ${over === status ? "ring-2 ring-accent" : ""}`}
          >
            <h3 className="flex items-center gap-2 px-1 text-sm font-semibold">
              <span className={`size-2 rounded-full ${ACCENT[status]}`} />
              {STATUS_LABEL[status]}
              <span className="ml-auto text-xs font-normal text-muted">{column.length}</span>
            </h3>
            {column.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                assignee={t.assigneeId ? members.get(t.assigneeId) : undefined}
                canDelete={canDelete}
                onMove={(s) => onMove(t, s)}
                onDelete={() => onDelete(t)}
                onOpen={() => onOpen(t)}
              />
            ))}
            {column.length === 0 && <p className="px-1 py-6 text-center text-xs text-muted">Drop tasks here</p>}
          </section>
        );
      })}
    </div>
  );
}
