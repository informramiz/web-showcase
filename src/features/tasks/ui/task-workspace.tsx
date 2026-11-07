"use client";

import { useEffect, useMemo, useState } from "react";
import type { Role } from "@/features/projects/domain/types";
import { STATUS_LABEL, TASK_STATUSES, type TaskJson, type TaskStatus } from "../domain/types";
import { Board } from "./board";
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from "./hooks";
import type { MemberRef } from "./task-card";
import { TaskList } from "./task-list";

const BOARD_LIMIT = 100;
const LIST_PAGE_SIZE = 10;

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

interface Props {
  projectId: string;
  members: MemberRef[];
  role: Role;
  currentUserId: string;
}

export function TaskWorkspace({ projectId, members, role, currentUserId }: Props) {
  const [view, setView] = useState<"board" | "list">("board");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput.trim());
  const [assigneeId, setAssigneeId] = useState("");
  const [status, setStatus] = useState<TaskStatus | "">("");
  const [pageState, setPageState] = useState({ page: 1, filterKey: "" });
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // Any filter change goes back to page 1.
  const filterKey = `${search}|${assigneeId}|${status}`;
  const page = pageState.filterKey === filterKey ? pageState.page : 1;
  const setPage = (p: number) => setPageState({ page: p, filterKey });

  const query =
    view === "board"
      ? { search, assigneeId, pageSize: BOARD_LIMIT }
      : { search, assigneeId, status: status || undefined, page, pageSize: LIST_PAGE_SIZE };
  const { data, isPending, isError, error, isFetching } = useTasks(projectId, query);

  const create = useCreateTask(projectId, currentUserId);
  const update = useUpdateTask(projectId);
  const remove = useDeleteTask(projectId);
  const mutationError = create.error ?? update.error ?? remove.error;

  const move = (task: TaskJson, to: TaskStatus) => {
    // Optimistically drop it at the bottom of the target column; the server computes the same position.
    const bottom = Math.max(0, ...(data?.items ?? []).filter((t) => t.status === to).map((t) => t.position)) + 1;
    update.mutate({ id: task.id, patch: { status: to, position: bottom } });
  };

  const [title, setTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const submit = () => {
    if (!title.trim()) return;
    create.mutate({ title: title.trim(), assigneeId: newAssignee || null, dueDate: dueDate || null });
    setTitle("");
    setDueDate("");
  };

  return (
    <section className="min-w-0 space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="card flex flex-col gap-2 p-3 sm:flex-row"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a task…"
          aria-label="New task title"
          maxLength={120}
          className="input sm:flex-1"
        />
        <div className="flex gap-2">
          <select
            value={newAssignee}
            onChange={(e) => setNewAssignee(e.target.value)}
            aria-label="Assignee"
            className="input w-auto flex-1 sm:w-36 sm:flex-none"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="Due date"
            className="input w-auto flex-1 sm:w-40 sm:flex-none"
          />
          <button className="btn-primary shrink-0" disabled={!title.trim()}>
            Add
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search tasks"
          aria-label="Search tasks"
          className="input w-full sm:w-56"
        />
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          aria-label="Filter by assignee"
          className="input w-auto"
        >
          <option value="">Everyone</option>
          <option value="unassigned">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {view === "list" && (
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus | "")}
            aria-label="Filter by status"
            className="input w-auto"
          >
            <option value="">Any status</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex rounded-md border border-border bg-surface p-0.5 text-sm" role="tablist">
          {(["board", "list"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded px-3 py-1 capitalize ${view === v ? "bg-accent text-accent-fg" : "text-muted"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {mutationError && (
        <p role="alert" className="text-sm text-danger">
          {mutationError.message}. Your change was undone.
        </p>
      )}
      {isError && <p className="text-sm text-danger">Could not load tasks: {error.message}</p>}
      {isPending && <p className="text-sm text-muted">Loading tasks…</p>}

      {data && (
        <div className={isFetching ? "opacity-90" : undefined}>
          {view === "board" ? (
            <>
              <Board
                tasks={data.items}
                members={memberMap}
                canDelete={role === "owner"}
                onMove={move}
                onDelete={(t) => remove.mutate(t.id)}
              />
              {data.total > data.items.length && (
                <p className="mt-2 text-xs text-muted">
                  Showing the first {data.items.length} of {data.total} tasks. Use search or the list view for the rest.
                </p>
              )}
            </>
          ) : (
            <TaskList page={data} members={memberMap} onMove={move} onPage={setPage} />
          )}
        </div>
      )}
    </section>
  );
}
