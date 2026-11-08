import type { TaskStatus } from "./types";

// Fixed locale and UTC so the label is identical in the server render and in the browser (no hydration mismatch).
const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Today's calendar date (YYYY-MM-DD, UTC), the same unit as a task's due date. */
export function todayIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Card label for a due date, e.g. "Mar 4", and whether an unfinished task is past it. */
export function dueLabel(
  dueDate: string | null,
  status: TaskStatus,
  today: string = todayIso(),
): { text: string; overdue: boolean } | null {
  if (!dueDate) return null;
  return { text: format.format(new Date(`${dueDate}T00:00:00Z`)), overdue: status !== "done" && dueDate < today };
}
