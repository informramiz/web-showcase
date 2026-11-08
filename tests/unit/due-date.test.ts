import { describe, expect, it } from "vitest";
import { dueLabel, todayIso } from "@/features/tasks/domain/due-date";

describe("dueLabel", () => {
  it("formats the calendar date the same way everywhere", () => {
    expect(dueLabel("2026-03-04", "todo", "2026-03-01")).toEqual({ text: "Mar 4", overdue: false });
  });

  it("marks unfinished tasks past their date as overdue", () => {
    expect(dueLabel("2026-03-04", "in_progress", "2026-03-05")?.overdue).toBe(true);
    expect(dueLabel("2026-03-04", "done", "2026-03-05")?.overdue).toBe(false);
    expect(dueLabel("2026-03-04", "todo", "2026-03-04")?.overdue).toBe(false);
  });

  it("returns null without a due date", () => {
    expect(dueLabel(null, "todo")).toBeNull();
  });

  it("takes today in UTC", () => {
    expect(todayIso(new Date("2026-03-04T23:30:00Z"))).toBe("2026-03-04");
  });
});
