import type { z } from "zod";
import { AppError } from "./errors";

/** Parses input with a zod schema, throwing a validation AppError with per-field messages. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fields: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  throw new AppError("validation", "Invalid input", fields);
}
