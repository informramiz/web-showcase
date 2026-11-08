import { STATUS_LABEL } from "@/features/tasks/domain/types";
import type { ActivityAction, ActivityDetail } from "./types";

const FIELD_LABEL: Record<string, string> = {
  title: "title",
  description: "description",
  assigneeId: "assignee",
  dueDate: "due date",
  position: "order",
};

/** One readable line per audit entry, e.g. "moved it from To do to Done". The actor's name is shown separately. */
export function describeActivity(action: ActivityAction, detail: ActivityDetail | null): string {
  switch (action) {
    case "task.created":
      return "created the task";
    case "task.updated": {
      const fields = (detail?.fields ?? []).map((f) => FIELD_LABEL[f] ?? f);
      return fields.length ? `changed the ${fields.join(", ")}` : "edited the task";
    }
    case "task.moved":
      return detail?.from && detail.to
        ? `moved it from ${STATUS_LABEL[detail.from]} to ${STATUS_LABEL[detail.to]}`
        : "moved the task";
    case "task.deleted":
      return "deleted the task";
    case "comment.added":
      return "commented";
    case "attachment.added":
      return `attached ${detail?.name ?? "a file"}`;
    case "attachment.deleted":
      return `removed ${detail?.name ?? "a file"}`;
  }
}
