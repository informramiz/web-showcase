"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/avatar";
import { describeActivity } from "@/features/activity/domain/describe";
import { STATUS_LABEL } from "../domain/types";
import { AttachmentsSection } from "./attachments-section";
import { useAddComment, useTaskDetail } from "./hooks";
import type { MemberRef } from "./task-card";

interface Props {
  projectId: string;
  taskId: string;
  members: Map<string, MemberRef>;
  currentUserId: string;
  isOwner: boolean;
  onClose: () => void;
}

const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/** Side panel with a task's description, files, comments and audit trail. */
export function TaskDetail({ projectId, taskId, members, currentUserId, isOwner, onClose }: Props) {
  const { data, isPending, isError, error } = useTaskDetail(projectId, taskId);
  const addComment = useAddComment(projectId, taskId);
  const [body, setBody] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    addComment.mutate(text, { onSuccess: () => setBody("") });
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <aside
        role="dialog"
        aria-label="Task details"
        data-testid="task-detail"
        className="h-full w-full max-w-md space-y-5 overflow-y-auto bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-lg font-semibold">{data?.task.title ?? "Task"}</h2>
          <button type="button" onClick={onClose} className="btn-ghost py-1" aria-label="Close">
            ✕
          </button>
        </div>
        {isPending && <p className="text-sm text-muted">Loading…</p>}
        {isError && <p className="text-sm text-danger">Could not load the task: {error.message}</p>}
        {data && (
          <>
            <div className="space-y-1 text-sm">
              <p className="text-muted">
                {STATUS_LABEL[data.task.status]}
                {data.task.assigneeId && ` · ${members.get(data.task.assigneeId)?.name ?? "Former member"}`}
                {data.task.dueDate && ` · due ${data.task.dueDate}`}
              </p>
              {data.task.description && <p className="whitespace-pre-wrap">{data.task.description}</p>}
            </div>

            {data.attachmentsEnabled ? (
              <AttachmentsSection
                projectId={projectId}
                taskId={taskId}
                attachments={data.attachments}
                canDelete={(a) => isOwner || a.uploaderId === currentUserId}
              />
            ) : (
              <section className="space-y-1" data-testid="attachments-disabled">
                <h3 className="text-sm font-semibold">Files</h3>
                <p className="text-sm text-muted">
                  File attachments are turned off on this deployment (no file storage is configured).
                </p>
              </section>
            )}

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">Comments</h3>
              {data.comments.length === 0 && <p className="text-sm text-muted">No comments yet.</p>}
              <ul className="space-y-3">
                {data.comments.map((c) => (
                  <li key={c.id} data-testid="comment" className="flex gap-2">
                    <Avatar name={c.authorName} size="sm" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p>
                        <span className="font-medium">{c.authorName}</span>{" "}
                        <span className="text-xs text-muted">{when(c.createdAt)}</span>
                      </p>
                      <p className="whitespace-pre-wrap break-words">{c.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
              >
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Write a comment…"
                  aria-label="Comment"
                  maxLength={2000}
                  rows={2}
                  className="input"
                />
                {addComment.error && <p className="text-sm text-danger">{addComment.error.message}</p>}
                <button className="btn-primary" disabled={!body.trim() || addComment.isPending}>
                  Comment
                </button>
              </form>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Activity</h3>
              <ol className="space-y-1.5 text-sm" data-testid="activity">
                {data.activity.map((a) => (
                  <li key={a.id} className="text-muted">
                    <span className="font-medium text-text">{a.actorName}</span> {describeActivity(a.action, a.detail)}
                    <span className="text-xs"> · {when(a.createdAt)}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
