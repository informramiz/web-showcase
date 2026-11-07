import { z } from "zod";
import { TASK_STATUSES } from "./types";

const status = z.enum(TASK_STATUSES);
const dueDate = z.iso.date("Use a YYYY-MM-DD date").nullable();
const assigneeId = z.string().min(1).nullable();

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Enter a title").max(120),
  description: z.string().trim().max(2000).default(""),
  status: status.default("todo"),
  assigneeId: assigneeId.default(null),
  dueDate: dueDate.default(null),
});

export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Enter a title").max(120),
    description: z.string().trim().max(2000),
    status,
    assigneeId,
    dueDate,
    position: z.number(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

/** Query string for the task list. Empty strings mean "not set" so plain HTML forms work. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), schema.optional());

export const taskQuerySchema = z.object({
  search: optional(z.string().trim().max(100)),
  status: optional(status),
  assigneeId: optional(z.string().max(64)),
  page: optional(z.coerce.number().int().min(1)).transform((v) => v ?? 1),
  pageSize: optional(z.coerce.number().int().min(1).max(100)).transform((v) => v ?? 20),
});

export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
export type TaskQuery = z.output<typeof taskQuerySchema>;
