"use client";

import { useRef } from "react";
import { MAX_ATTACHMENT_BYTES } from "@/features/attachments/domain/limits";
import type { AttachmentJson } from "./api";
import { tasksApi } from "./api";
import { useDeleteAttachment, useUploadAttachment } from "./hooks";

interface Props {
  projectId: string;
  taskId: string;
  attachments: AttachmentJson[];
  /** Uploader or project owner; the server enforces the same rule. */
  canDelete: (a: AttachmentJson) => boolean;
}

const ACCEPT = "image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/csv";

const formatSize = (bytes: number) =>
  bytes < 1024
    ? `${String(bytes)} B`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function AttachmentsSection({ projectId, taskId, attachments, canDelete }: Props) {
  const upload = useUploadAttachment(projectId, taskId);
  const remove = useDeleteAttachment(projectId, taskId);
  const input = useRef<HTMLInputElement>(null);

  const onPick = (file: File | undefined) => {
    if (!file) return;
    upload.mutate(file, {
      onSettled: () => {
        if (input.current) input.current.value = "";
      },
    });
  };

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">Files</h3>
      {attachments.length === 0 && <p className="text-sm text-muted">No files yet.</p>}
      <ul className="space-y-1.5 text-sm">
        {attachments.map((a) => (
          <li key={a.id} data-testid="attachment" className="flex items-center gap-2">
            <a
              href={tasksApi.attachmentUrl(projectId, taskId, a.id)}
              download
              className="min-w-0 flex-1 truncate underline"
            >
              {a.name}
            </a>
            <span className="text-xs text-muted">
              {formatSize(a.size)} · {a.uploaderName}
            </span>
            {canDelete(a) && (
              <button
                type="button"
                className="btn-ghost py-0.5 text-xs"
                onClick={() => remove.mutate(a.id)}
                disabled={remove.isPending}
                aria-label={`Delete ${a.name}`}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      <label className="btn-ghost inline-block cursor-pointer text-sm">
        {upload.isPending ? "Uploading…" : "Attach a file"}
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          data-testid="attachment-input"
          disabled={upload.isPending}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </label>
      <p className="text-xs text-muted">Images, PDF, text or CSV, up to {MAX_ATTACHMENT_BYTES / 1024 / 1024} MB.</p>
      {upload.error && <p className="text-sm text-danger">{upload.error.message}</p>}
      {remove.error && <p className="text-sm text-danger">{remove.error.message}</p>}
    </section>
  );
}
