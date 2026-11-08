import { describe, expect, it } from "vitest";
import { AppError, isAppError } from "@/core/errors";
import { parseInput } from "@/core/validation";
import { loginSchema, registerSchema } from "@/features/auth/domain/schemas";
import { can } from "@/features/projects/domain/permissions";
import { createTaskSchema, taskQuerySchema, updateTaskSchema } from "@/features/tasks/domain/schemas";
import { toTaskJson } from "@/features/tasks/domain/types";

describe("permissions", () => {
  it("lets owners do everything", () => {
    for (const a of ["project.delete", "members.manage", "task.delete", "task.create"] as const) {
      expect(can("owner", a)).toBe(true);
    }
  });

  it("lets members view and work on tasks, but not delete or manage", () => {
    expect(can("member", "project.view")).toBe(true);
    expect(can("member", "task.create")).toBe(true);
    expect(can("member", "task.update")).toBe(true);
    expect(can("member", "task.delete")).toBe(false);
    expect(can("member", "members.manage")).toBe(false);
    expect(can("member", "project.delete")).toBe(false);
  });

  it("denies non-members everything", () => {
    expect(can(null, "project.view")).toBe(false);
  });
});

describe("AppError", () => {
  it("maps kinds to HTTP status codes", () => {
    expect(new AppError("validation", "x").status).toBe(400);
    expect(new AppError("unauthorized", "x").status).toBe(401);
    expect(new AppError("forbidden", "x").status).toBe(403);
    expect(new AppError("not_found", "x").status).toBe(404);
    expect(new AppError("conflict", "x").status).toBe(409);
    expect(isAppError(new Error("x"))).toBe(false);
  });
});

describe("parseInput", () => {
  it("collects messages per field", () => {
    try {
      parseInput(registerSchema, { name: "", email: "nope", password: "short" });
      expect.unreachable();
    } catch (e) {
      expect(isAppError(e) && e.kind).toBe("validation");
      const fields = (e as AppError).fields ?? {};
      expect(Object.keys(fields).sort()).toEqual(["email", "name", "password"]);
    }
  });

  it("uses _ for root-level issues", () => {
    expect(() => parseInput(updateTaskSchema, {})).toThrow(
      expect.objectContaining({ fields: { _: ["Nothing to update"] } }),
    );
  });

  it("normalises email case and whitespace", () => {
    expect(parseInput(loginSchema, { email: "  Dana@Example.COM ", password: "x" }).email).toBe("dana@example.com");
  });
});

describe("task schemas", () => {
  it("fills defaults on create", () => {
    expect(parseInput(createTaskSchema, { title: "  Ship it " })).toEqual({
      title: "Ship it",
      description: "",
      status: "todo",
      assigneeId: null,
      dueDate: null,
    });
  });

  it("rejects bad dates and statuses", () => {
    expect(() => parseInput(createTaskSchema, { title: "x", dueDate: "31/12/2026" })).toThrow(AppError);
    expect(() => parseInput(updateTaskSchema, { status: "blocked" })).toThrow(AppError);
  });

  it("parses the list query string, treating empty values as unset", () => {
    expect(parseInput(taskQuerySchema, { search: "", status: "", page: "3", pageSize: "10" })).toEqual({
      search: undefined,
      status: undefined,
      assigneeId: undefined,
      page: 3,
      pageSize: 10,
    });
    expect(parseInput(taskQuerySchema, {})).toMatchObject({ page: 1, pageSize: 20 });
    expect(() => parseInput(taskQuerySchema, { pageSize: "500" })).toThrow(AppError);
  });
});

describe("toTaskJson", () => {
  it("serialises dates exactly as Response.json would", () => {
    const at = new Date("2026-03-04T05:06:07.000Z");
    const task = {
      id: "t1",
      projectId: "p1",
      title: "Ship it",
      description: "",
      status: "todo" as const,
      assigneeId: null,
      dueDate: null,
      position: 1,
      createdBy: "u1",
      createdAt: at,
      updatedAt: at,
    };
    expect(toTaskJson(task)).toEqual(JSON.parse(JSON.stringify(task)));
  });
});
