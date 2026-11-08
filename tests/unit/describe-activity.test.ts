import { describe, expect, it } from "vitest";
import { describeActivity } from "@/features/activity/domain/describe";

describe("describeActivity", () => {
  it("reads naturally for every action", () => {
    expect(describeActivity("task.created", null)).toBe("created the task");
    expect(describeActivity("task.updated", { fields: ["assigneeId", "dueDate"] })).toBe(
      "changed the assignee, due date",
    );
    expect(describeActivity("task.updated", null)).toBe("edited the task");
    expect(describeActivity("task.moved", { from: "todo", to: "done" })).toBe("moved it from To do to Done");
    expect(describeActivity("task.moved", null)).toBe("moved the task");
    expect(describeActivity("task.deleted", null)).toBe("deleted the task");
    expect(describeActivity("comment.added", null)).toBe("commented");
    expect(describeActivity("attachment.added", { name: "spec.pdf" })).toBe("attached spec.pdf");
    expect(describeActivity("attachment.deleted", null)).toBe("removed a file");
  });
});
